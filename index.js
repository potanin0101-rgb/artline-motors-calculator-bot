const { loadEnvFile } = require("./src/env");
const { calculateImport } = require("./src/calculator");
const { formatResult, moneyUsd } = require("./src/format");
const { getRates } = require("./src/rates");

loadEnvFile();

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

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
    sessions.set(chatId, { option: null, step: null, data: {} });
  }
  return sessions.get(chatId);
}

function resetSession(chatId) {
  const session = { option: null, step: null, data: {} };
  sessions.set(chatId, session);
  return session;
}

function currentStepIndex(session) {
  return STEPS.indexOf(session.step);
}

function back(session) {
  const index = currentStepIndex(session);
  if (index <= 0) {
    session.step = null;
    session.option = null;
    return;
  }
  const previousStep = STEPS[index - 1];
  delete session.data[previousStep];
  session.step = previousStep;
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
      text: "Выбери вариант покупки. Сейчас в MVP активен расчет покупки у дилера в США.",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Дилер США", callback_data: "option:us_dealer" }],
          [{ text: "Аукцион США - добавим позже", callback_data: "option:soon:auction_us" }],
          [{ text: "Китай - добавим позже", callback_data: "option:soon:china" }]
        ]
      }
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
    destination: session.data.destination
  }, rates);

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
      text: "Я считаю стоимость авто из США у дилера до Ростова-на-Дону или Москвы. Нажми /new, чтобы начать новый расчет."
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
  const nextIndex = currentStepIndex(session) + 1;
  session.step = STEPS[nextIndex];
  await ask(chatId, session);
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

  if (data === "option:us_dealer") {
    session.option = "us_dealer";
    session.step = "carPriceUsd";
    session.data = {};
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
    session.step = STEPS[STEPS.indexOf(step) + 1];
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `Принял: ${moneyUsd(value)}`
    });
    await ask(chatId, session);
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
