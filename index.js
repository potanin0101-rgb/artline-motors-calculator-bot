const path = require("node:path");
const { loadEnvFile } = require("./src/env");
const { calculateImport } = require("./src/calculator");
const { formatResult, moneyUsd, vehicleHeader } = require("./src/format");
const { formatImportedVehicle, importListingFromUrl, isSupportedListingUrl } = require("./src/listing");
const { getRates } = require("./src/rates");

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile();

const BOT_TOKEN = process.env.BOT_TOKEN
  || process.env.TELEGRAM_BOT_TOKEN
  || process.env.TOKEN;
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;
const IMPORT_STEP = "edmundsUrl";

const sessions = new Map();

const STEPS = [
  "carPriceUsd",
  "engineCc",
  "horsepower",
  "productionYear",
  "productionMonth",
  "usInlandUsd",
  "oceanUsd",
  "commissionRub",
  "destination"
];

const STEP_TEXT = {
  carPriceUsd: "Введи стоимость автомобиля у дилера в USD.\nНапример: 48500",
  engineCc: "Введи объем двигателя в куб. см.\nНапример: 1998",
  horsepower: "Введи мощность в л.с.\nНапример: 249",
  productionYear: "Введи год производства.\nНапример: 2023",
  productionMonth: "Введи месяц производства числом от 1 до 12.\nНапример: 7",
  usInlandUsd: "Введи доставку по США до порта NY в USD.\nМожно выбрать быстрый вариант ниже или отправить свою сумму.",
  oceanUsd: "Выбери океанскую доставку или отправь свою сумму в USD.",
  commissionRub: "Введи свою желаемую комиссию в рублях.\nНапример: 150000",
  destination: "Куда считаем итоговую стоимость?"
};

function parseAmount(text) {
  const normalized = String(text)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { option: null, step: null, data: {}, vehicle: null });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  const session = { option: null, step: null, data: {}, vehicle: null };
  sessions.set(chatId, session);
  return session;
}

function currentStepIndex(session) {
  return STEPS.indexOf(session.step);
}

function back(session) {
  if (session.step === IMPORT_STEP) {
    session.step = null;
    session.option = null;
    session.data = {};
    session.vehicle = null;
    return;
  }

  const index = currentStepIndex(session);
  if (index <= 0) {
    if (session.option === "edmunds_import") {
      session.step = IMPORT_STEP;
      session.data = {};
      session.vehicle = null;
      return;
    }
    session.step = null;
    session.option = null;
    return;
  }
  const previousStep = STEPS[index - 1];
  delete session.data[previousStep];
  session.step = previousStep;
}

function firstMissingStep(data) {
  return STEPS.find((step) => data[step] === undefined || data[step] === null);
}

function advanceToNextMissingStep(session) {
  session.step = firstMissingStep(session.data) || null;
  return session.step;
}

async function telegram(method, payload) {
  const response = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

function baseKeyboard(includeBack = true) {
  const rows = [];
  if (includeBack) rows.push([{ text: "Назад", callback_data: "nav:back" }]);
  rows.push([{ text: "Начать заново", callback_data: "nav:restart" }]);
  return { inline_keyboard: rows };
}

function keyboardForStep(step) {
  if (step === "usInlandUsd") {
    return {
      inline_keyboard: [
        [
          { text: "$500", callback_data: "set:usInlandUsd:500" },
          { text: "$1000", callback_data: "set:usInlandUsd:1000" }
        ],
        [
          { text: "$1500", callback_data: "set:usInlandUsd:1500" },
          { text: "$2000", callback_data: "set:usInlandUsd:2000" }
        ],
        [{ text: "Назад", callback_data: "nav:back" }]
      ]
    };
  }

  if (step === "oceanUsd") {
    return {
      inline_keyboard: [
        [{ text: "В составе 3 машин - $6500", callback_data: "set:oceanUsd:6500" }],
        [{ text: "В составе 2 машин - $7500", callback_data: "set:oceanUsd:7500" }],
        [{ text: "Назад", callback_data: "nav:back" }]
      ]
    };
  }

  if (step === "destination") {
    return {
      inline_keyboard: [
        [{ text: "До Ростова-на-Дону", callback_data: "city:rostov" }],
        [{ text: "До Москвы", callback_data: "city:moscow" }],
        [{ text: "Назад", callback_data: "nav:back" }]
      ]
    };
  }

  return baseKeyboard(true);
}

async function ask(chatId, session) {
  if (!session.option) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Выбери, как считать авто: вручную по дилеру или по ссылке Edmunds.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Ручной просчет от дилера", callback_data: "option:dealer_manual" }],
          [{ text: "Просчет по ссылке Edmunds", callback_data: "option:edmunds_import" }],
          [{ text: "Аукцион США - добавим позже", callback_data: "option:soon:auction_us" }],
          [{ text: "Китай - добавим позже", callback_data: "option:soon:china" }]
        ]
      }
    });
    return;
  }

  if (session.step === IMPORT_STEP) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Отправь ссылку на VIN-страницу Edmunds.\nНапример: https://www.edmunds.com/honda/hr-v/2024/vin/3CZRZ2H35RM714945/",
      reply_markup: baseKeyboard(true)
    });
    return;
  }

  await telegram("sendMessage", {
    chat_id: chatId,
    text: STEP_TEXT[session.step],
    reply_markup: keyboardForStep(session.step)
  });
}

function validateStep(step, value) {
  const nowYear = new Date().getFullYear();
  if (value === null || value === undefined || Number.isNaN(value)) return "Нужно число. Попробуй еще раз.";

  if (step === "carPriceUsd" && value <= 0) return "Стоимость должна быть больше нуля.";
  if (step === "engineCc" && (value < 1 || value > 10000)) return "Объем выглядит неверно. Введи куб. см, например 1998.";
  if (step === "horsepower" && (value < 1 || value > 2000)) return "Мощность выглядит неверно. Введи л.с., например 249.";
  if (step === "productionYear" && (value < 1980 || value > nowYear)) return `Год должен быть от 1980 до ${nowYear}.`;
  if (step === "productionMonth" && (value < 1 || value > 12)) return "Месяц должен быть числом от 1 до 12.";
  if ((step === "usInlandUsd" || step === "oceanUsd") && value < 0) return "Сумма не может быть отрицательной.";
  if (step === "commissionRub" && value < 0) return "Комиссия не может быть отрицательной.";
  return null;
}

async function completeCalculation(chatId, session) {
  await telegram("sendMessage", {
    chat_id: chatId,
    text: "Считаю итог. Беру свежий курс ЦБ, если он доступен."
  });

  const rates = await getRates();
  const result = calculateImport({
    purchaseOption: "us_dealer",
    carPriceUsd: session.data.carPriceUsd,
    engineCc: session.data.engineCc,
    horsepower: session.data.horsepower,
    productionYear: session.data.productionYear,
    productionMonth: session.data.productionMonth,
    usInlandUsd: session.data.usInlandUsd,
    oceanUsd: session.data.oceanUsd,
    commissionRub: session.data.commissionRub,
    destination: session.data.destination,
    vehicle: session.vehicle
  }, rates);

  const photos = Array.isArray(session.vehicle?.photos) ? session.vehicle.photos.slice(0, 10) : [];
  if (photos.length) {
    try {
      await telegram("sendMediaGroup", {
        chat_id: chatId,
        media: photos.map((photoUrl, index) => ({
          type: "photo",
          media: photoUrl,
          ...(index === 0 ? { caption: `Фото из объявления: ${vehicleHeader(session.vehicle) || "Автомобиль"}` } : {})
        }))
      });
    } catch (error) {
      console.error("sendMediaGroup failed:", error);
      await telegram("sendMessage", {
        chat_id: chatId,
        text: "Фото из объявления не удалось отправить, но сам расчет ниже пришлю."
      });
    }
  }

  const warning = rates.warning ? `\n\nВажно: ${rates.warning}` : "";
  await telegram("sendMessage", {
    chat_id: chatId,
    text: `${formatResult(result)}${warning}`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Посчитать еще авто", callback_data: "nav:restart" }],
        [{ text: "Исправить последний шаг", callback_data: "nav:back" }]
      ]
    }
  });
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || "";
  const session = getSession(chatId);

  if (text === "/start" || text === "/new") {
    resetSession(chatId);
    await ask(chatId, getSession(chatId));
    return;
  }

  if (text === "/help") {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Я умею считать авто двумя способами: ручной просчет от дилера и импорт по ссылке Edmunds. Можно выбрать ветку через /new или сразу прислать Edmunds VIN-ссылку."
    });
    return;
  }

  if (isSupportedListingUrl(text)) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Смотрю объявление и вытягиваю данные по машине."
    });

    try {
      const imported = await importListingFromUrl(text, {
        fetchMode: "playwright"
      });
      session.option = "edmunds_import";
      session.data = {
        ...imported.data
      };
      session.vehicle = imported.vehicle;
      advanceToNextMissingStep(session);

      await telegram("sendMessage", {
        chat_id: chatId,
        text: formatImportedVehicle(imported.vehicle)
      });

      if (session.step) {
        await ask(chatId, session);
      } else {
        await completeCalculation(chatId, session);
      }
    } catch (error) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: `Не получилось разобрать ссылку: ${error.message}`
      });
    }
    return;
  }

  if (/^https?:\/\//i.test(text)) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Ссылки сейчас поддерживаю только с Edmunds VIN-страниц. Для других сайтов пока используй ручной просчет."
    });
    return;
  }

  if (session.option === "edmunds_import" && session.step === IMPORT_STEP) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Жду именно ссылку на Edmunds с VIN-страницей. Если хочешь ручной просчет, нажми «Назад» и выбери ручную ветку."
    });
    return;
  }

  if (!session.option || !session.step) {
    await ask(chatId, session);
    return;
  }

  if (session.step === "destination") {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Выбери город кнопкой ниже.",
      reply_markup: keyboardForStep("destination")
    });
    return;
  }

  const value = parseAmount(text);
  const error = validateStep(session.step, value);
  if (error) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: error,
      reply_markup: keyboardForStep(session.step)
    });
    return;
  }

  session.data[session.step] = Math.round(value);
  if (advanceToNextMissingStep(session)) {
    await ask(chatId, session);
    return;
  }

  await completeCalculation(chatId, session);
}

async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const session = getSession(chatId);

  await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });

  if (data === "nav:restart") {
    resetSession(chatId);
    await ask(chatId, getSession(chatId));
    return;
  }

  if (data === "nav:back") {
    back(session);
    await ask(chatId, session);
    return;
  }

  if (data === "option:dealer_manual") {
    session.option = "dealer_manual";
    session.vehicle = null;
    session.data = {};
    advanceToNextMissingStep(session);
    await ask(chatId, session);
    return;
  }

  if (data === "option:edmunds_import") {
    session.option = "edmunds_import";
    session.vehicle = null;
    session.data = {};
    session.step = IMPORT_STEP;
    await ask(chatId, session);
    return;
  }

  if (data.startsWith("option:soon")) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Этот вариант заложу следующим этапом. Сейчас считаем дилера США."
    });
    return;
  }

  if (data.startsWith("set:")) {
    const [, step, rawValue] = data.split(":");
    const value = Number(rawValue);
    session.data[step] = value;
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `Принял: ${moneyUsd(value)}`
    });
    if (advanceToNextMissingStep(session)) {
      await ask(chatId, session);
      return;
    }

    await completeCalculation(chatId, session);
    return;
  }

  if (data.startsWith("city:")) {
    const destination = data.split(":")[1];
    session.data.destination = destination;
    await completeCalculation(chatId, session);
  }
}

async function poll() {
  if (!BOT_TOKEN) {
    throw new Error("Не задан BOT_TOKEN. Добавь переменную окружения или файл .env на хостинге.");
  }

  let offset = 0;
  console.log("Artline Motors calculator bot started.");
  await telegram("deleteWebhook", { drop_pending_updates: false });

  while (true) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"]
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallback(update.callback_query);
      }
    } catch (error) {
      console.error(error);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

if (require.main === module) {
  poll().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  parseAmount,
  validateStep
};
