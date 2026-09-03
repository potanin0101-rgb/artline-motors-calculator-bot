function parseUrl(text) {
  try {
    return new URL(String(text).trim());
  } catch {
    return null;
  }
}

function isSupportedListingUrl(text) {
  const url = parseUrl(text);
  return Boolean(url && /(^|\.)edmunds\.com$/i.test(url.hostname) && url.pathname.includes("/vin/"));
}

function parseNumber(value) {
  const raw = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.-]/g, "")
    .trim();
  if (!raw) return null;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = raw.replace(/,/g, "");
    }
  } else if (hasComma) {
    const fraction = raw.slice(raw.lastIndexOf(",") + 1);
    normalized = fraction.length === 1 || fraction.length === 2
      ? raw.replace(",", ".")
      : raw.replace(/,/g, "");
  }

  normalized = normalized.replace(/(?!^)-/g, "");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function titleCase(value) {
  return String(value || "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function slugToDisplay(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 2) return part.toUpperCase();
      return part[0].toUpperCase() + part.slice(1);
    })
    .join("-");
}

function extractJsonLdObjects(html) {
  const scripts = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi) || [];
  const objects = [];

  for (const script of scripts) {
    const raw = script
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    if (!raw) continue;

    try {
      objects.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return objects;
}

function flattenGraphEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenGraphEntries);
  if (Array.isArray(value["@graph"])) return flattenGraphEntries(value["@graph"]);
  return [value];
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanHtmlText(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractElementTextByAttribute(html, attribute, attributeValue) {
  const escapedValue = String(attributeValue).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<([a-z][\\w:-]*)\\b[^>]*\\b${attribute}\\s*=\\s*["']${escapedValue}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i"
  );
  const match = String(html || "").match(pattern);
  return match ? cleanHtmlText(match[2]) : null;
}

function extractFirstElementText(html, attributes) {
  for (const [attribute, value] of attributes) {
    const text = extractElementTextByAttribute(html, attribute, value);
    if (text) return text;
  }
  return null;
}

function extractTagText(html, tagName) {
  const match = String(html || "").match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? cleanHtmlText(match[1]) : null;
}

function extractMetaContent(html, property) {
  const pattern = new RegExp(
    `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*\\bcontent\\s*=\\s*["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reversePattern = new RegExp(
    `<meta\\b[^>]*\\bcontent\\s*=\\s*["']([^"']+)["'][^>]*(?:property|name)\\s*=\\s*["']${property}["'][^>]*>`,
    "i"
  );
  const match = String(html || "").match(pattern) || String(html || "").match(reversePattern);
  return match ? cleanHtmlText(match[1]) : null;
}

function extractEdmundsHtmlFields(html) {
  const priceText = extractFirstElementText(html, [
    ["data-test", "vdp-price-row"],
    ["data-testid", "vdp-price-row"],
    ["data-test", "vdp-price"],
    ["data-testid", "vdp-price"]
  ]);
  const mileageText = extractFirstElementText(html, [
    ["data-test", "vdp-mileage-row"],
    ["data-testid", "vdp-mileage-row"],
    ["data-test", "vdp-mileage"],
    ["data-testid", "vdp-mileage"],
    ["data-test", "vehicle-mileage"],
    ["data-testid", "vehicle-mileage"]
  ]);
  const title = extractTagText(html, "h1") || extractMetaContent(html, "og:title");

  return {
    title,
    priceUsd: parseNumber(priceText),
    mileage: parseNumber(mileageText),
    trim: extractFirstElementText(html, [
      ["data-test", "vdp-trim"],
      ["data-testid", "vdp-trim"],
      ["data-test", "vehicle-trim"],
      ["data-testid", "vehicle-trim"]
    ]),
    transmission: extractFirstElementText(html, [
      ["data-test", "vdp-transmission"],
      ["data-testid", "vdp-transmission"]
    ]),
    drivetrain: extractFirstElementText(html, [
      ["data-test", "vdp-drivetrain"],
      ["data-testid", "vdp-drivetrain"]
    ]),
    engineLiters: parseNumber(extractFirstElementText(html, [
      ["data-test", "vdp-engine"],
      ["data-testid", "vdp-engine"]
    ])),
    horsepower: parseNumber(extractFirstElementText(html, [
      ["data-test", "vdp-horsepower"],
      ["data-testid", "vdp-horsepower"]
    ]))
  };
}

function hasEdmundsVehicleData(html) {
  const fields = extractEdmundsHtmlFields(html);
  const hasJsonLdVehicle = extractJsonLdObjects(html)
    .flatMap(flattenGraphEntries)
    .some((entry) => entry?.["@type"] === "Vehicle");

  return Boolean(
    hasJsonLdVehicle
    || fields.title
    || fields.priceUsd !== null
    || fields.mileage !== null
  );
}

function inferTrimFromTitle(title, vehicle) {
  if (!title || !vehicle) return null;

  const prefix = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedTitle = String(title).replace(/\s+/g, " ").trim();
  const normalizedPrefix = prefix.toLowerCase();

  if (normalizedTitle.toLowerCase().startsWith(normalizedPrefix)) {
    const trim = normalizedTitle.slice(prefix.length).trim();
    return trim || null;
  }

  return null;
}

function normalizeEdmundsPhotoUrl(url) {
  if (!url) return null;
  const normalized = String(url).trim();
  if (!normalized) return null;

  if (normalized.startsWith("/assets/")) {
    return `https://www.edmunds.com${normalized}`;
  }

  if (/^https:\/\/www\.edmunds\.com\/assets\//i.test(normalized)) {
    return normalized;
  }

  return null;
}

function getPhotoKey(url) {
  const normalized = normalizeEdmundsPhotoUrl(url);
  if (!normalized) return null;
  return normalized.replace(/-\d+x\d*(?=\.(?:jpg|jpeg|png|webp)$)/i, "");
}

function getPhotoScore(url) {
  const match = String(url).match(/-(\d+)x(\d*)(?=\.(?:jpg|jpeg|png|webp)$)/i);
  if (!match) return 0;
  const width = Number(match[1] || 0);
  const height = Number(match[2] || 0);
  return height > 0 ? width * height : width * width;
}

function pushUniquePhoto(photoMap, url) {
  const normalized = normalizeEdmundsPhotoUrl(url);
  if (!normalized) return;

  const key = getPhotoKey(normalized) || normalized;
  const current = photoMap.get(key);
  if (!current || getPhotoScore(normalized) > getPhotoScore(current)) {
    photoMap.set(key, normalized);
  }
}

function extractEdmundsPhotoUrls(html, vehicle = null, limit = 10) {
  const photoMap = new Map();

  const vehicleImages = vehicle?.image;
  if (Array.isArray(vehicleImages)) {
    for (const image of vehicleImages) pushUniquePhoto(photoMap, image);
  } else if (vehicleImages) {
    pushUniquePhoto(photoMap, vehicleImages);
  }

  const htmlMatches = html.match(/(?:https:\/\/www\.edmunds\.com)?\/assets\/m\/for-sale\/[^"'`\s<>()]+\.(?:jpg|jpeg|png|webp)/gi) || [];

  for (const match of htmlMatches) {
    pushUniquePhoto(photoMap, match);
  }

  return Array.from(photoMap.values()).slice(0, limit);
}

function parseEdmundsVehicleFromHtml(html, pageUrl = null) {
  const entries = extractJsonLdObjects(html).flatMap(flattenGraphEntries);
  const vehicle = entries.find((entry) => entry?.["@type"] === "Vehicle");
  const htmlFields = extractEdmundsHtmlFields(html);
  const urlVehicle = parseEdmundsVehicleFromUrl(pageUrl) || {};

  if (!vehicle && !htmlFields.title && !htmlFields.priceUsd && !htmlFields.mileage) {
    throw new Error("Не удалось найти блок данных автомобиля на странице Edmunds.");
  }

  const title = vehicle?.name || htmlFields.title || urlVehicle.title || null;
  const year = parseNumber(vehicle?.vehicleModelDate || vehicle?.productionDate) ?? urlVehicle.year;
  const priceUsd = parseNumber(vehicle?.offers?.price) ?? htmlFields.priceUsd;
  const mileage = parseNumber(vehicle?.mileageFromOdometer?.value) ?? htmlFields.mileage;
  const horsepower = parseNumber(vehicle?.vehicleEngine?.enginePower?.value) ?? htmlFields.horsepower;
  const engineLiters = parseNumber(vehicle?.vehicleEngine?.engineDisplacement?.value) ?? htmlFields.engineLiters;
  const engineCc = engineLiters ? Math.round(engineLiters * 1000) : null;

  const inferredTrim = inferTrimFromTitle(title, {
    year,
    make: vehicle?.brand?.name || vehicle?.manufacturer || urlVehicle.make,
    model: vehicle?.model || urlVehicle.model
  });
  const trim = vehicle?.vehicleConfiguration
    || htmlFields.trim
    || inferredTrim;

  return {
    source: "Edmunds",
    sourceUrl: pageUrl,
    title,
    vin: vehicle?.vehicleIdentificationNumber || urlVehicle.vin || null,
    stockNumber: vehicle?.sku || null,
    year: year ? Math.round(year) : null,
    make: vehicle?.brand?.name || vehicle?.manufacturer || urlVehicle.make || null,
    model: vehicle?.model || urlVehicle.model || null,
    trim,
    priceUsd,
    mileage,
    drivetrain: vehicle?.driveWheelConfiguration || htmlFields.drivetrain || null,
    transmission: vehicle?.vehicleTransmission || htmlFields.transmission || null,
    bodyType: vehicle?.bodyType || null,
    fuelType: vehicle?.vehicleEngine?.fuelType || vehicle?.vehicleEngine?.engineType || null,
    horsepower: horsepower ? Math.round(horsepower) : null,
    engineLiters,
    engineCc,
    exteriorColor: vehicle?.color || null,
    interiorColor: vehicle?.vehicleInteriorColor || null,
    vehicleConfiguration: vehicle?.vehicleConfiguration || null,
    photos: extractEdmundsPhotoUrls(html, vehicle)
  };
}

function parseEdmundsVehicleFromUrl(urlText) {
  const url = parseUrl(urlText);
  if (!url) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const vinIndex = parts.indexOf("vin");
  if (vinIndex < 0 || !parts[vinIndex + 1]) return null;

  const make = titleCase(parts[0]);
  const model = slugToDisplay(parts[1]);
  const year = parseNumber(parts[2]);
  const vin = parts[vinIndex + 1].toUpperCase();

  return {
    source: "Edmunds",
    sourceUrl: url.href,
    title: [year, make, model].filter(Boolean).join(" "),
    vin,
    year: year ? Math.round(year) : null,
    make,
    model,
    trim: null,
    priceUsd: null,
    mileage: null,
    drivetrain: null,
    transmission: null,
    bodyType: null,
    fuelType: null,
    horsepower: null,
    engineLiters: null,
    engineCc: null,
    exteriorColor: null,
    interiorColor: null,
    vehicleConfiguration: null,
    photos: []
  };
}

async function decodeVin(vin) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${vin}?format=json`, {
      signal: controller.signal,
      headers: { "User-Agent": "ArtlineMotorsBot/0.1" }
    });
    if (!response.ok) throw new Error(`NHTSA HTTP ${response.status}`);

    const payload = await response.json();
    const row = payload.Results?.[0];
    if (!row || row.ErrorCode !== "0") {
      throw new Error(row?.ErrorText || "VIN не удалось декодировать.");
    }

    const engineCc = parseNumber(row.DisplacementCC);
    const engineLiters = parseNumber(row.DisplacementL);
    const horsepower = parseNumber(row.EngineHP);
    const year = parseNumber(row.ModelYear);

    return {
      vin: row.VIN || vin,
      make: row.Make || null,
      model: row.Model || null,
      trim: row.Trim || row.Series || null,
      year: year ? Math.round(year) : null,
      engineCc: engineCc ? Math.round(engineCc) : null,
      engineLiters,
      horsepower: horsepower ? Math.round(horsepower) : null,
      fuelType: row.FuelTypePrimary || null,
      drivetrain: row.DriveType || null,
      transmission: row.TransmissionStyle || null,
      bodyType: row.BodyClass || null,
      plantCountry: row.PlantCountry || null,
      cylinders: parseNumber(row.EngineCylinders),
      vehicleType: row.VehicleType || null
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mergeVehicleData(listingVehicle, vinVehicle = null) {
  const base = { ...listingVehicle };
  if (!vinVehicle) return base;

  return {
    ...vinVehicle,
    ...base,
    vin: base.vin || vinVehicle.vin,
    make: base.make || vinVehicle.make,
    model: vinVehicle.model || base.model,
    trim: vinVehicle.trim || base.trim,
    year: base.year || vinVehicle.year,
    engineCc: vinVehicle.engineCc || base.engineCc,
    engineLiters: vinVehicle.engineLiters || base.engineLiters,
    horsepower: vinVehicle.horsepower || base.horsepower,
    fuelType: vinVehicle.fuelType || base.fuelType,
    drivetrain: vinVehicle.drivetrain || base.drivetrain,
    transmission: vinVehicle.transmission || base.transmission,
    bodyType: vinVehicle.bodyType || base.bodyType,
    photos: Array.isArray(base.photos) ? base.photos : []
  };
}

function buildVehicleTitle(vehicle) {
  const detailedTitle = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  if (detailedTitle && (!vehicle.title || (vehicle.trim && !vehicle.title.includes(vehicle.trim)))) {
    return detailedTitle;
  }
  return vehicle.title || detailedTitle || "Автомобиль из объявления";
}

function buildPrefilledCalculationData(vehicle) {
  const data = {};
  if (vehicle.priceUsd) data.carPriceUsd = Math.round(vehicle.priceUsd);
  if (vehicle.engineCc) data.engineCc = Math.round(vehicle.engineCc);
  if (vehicle.horsepower) data.horsepower = Math.round(vehicle.horsepower);
  if (vehicle.year) data.productionYear = Math.round(vehicle.year);
  return data;
}

function formatImportedVehicle(vehicle) {
  const lines = [];
  lines.push(`Нашел объявление: ${buildVehicleTitle(vehicle)}`);
  if (vehicle.vin) lines.push(`VIN: ${vehicle.vin}`);
  if (vehicle.priceUsd) lines.push(`Цена на странице: $${Math.round(vehicle.priceUsd).toLocaleString("en-US")}`);
  if (vehicle.mileage) lines.push(`Пробег: ${Math.round(vehicle.mileage).toLocaleString("en-US")} mi`);

  const spec = [];
  if (vehicle.engineLiters) spec.push(`${vehicle.engineLiters.toFixed(1)}L`);
  if (vehicle.horsepower) spec.push(`${vehicle.horsepower} hp`);
  if (vehicle.fuelType) spec.push(vehicle.fuelType);
  if (vehicle.drivetrain) spec.push(vehicle.drivetrain);
  if (spec.length) lines.push(`Характеристики: ${spec.join(", ")}`);

  if (vehicle.trim) lines.push(`Комплектация: ${vehicle.trim}`);
  if (vehicle.transmission) lines.push(`Трансмиссия: ${vehicle.transmission}`);
  if (vehicle.exteriorColor || vehicle.interiorColor) {
    lines.push(`Цвета: ${[vehicle.exteriorColor, vehicle.interiorColor].filter(Boolean).join(" / ")}`);
  }
  if (Array.isArray(vehicle.photos) && vehicle.photos.length) {
    lines.push(`Фото в объявлении: ${vehicle.photos.length} шт.`);
  }
  if (vehicle.importWarning) {
    lines.push(`Важно: ${vehicle.importWarning}`);
  }

  lines.push("");
  const prepared = [];
  if (vehicle.priceUsd) prepared.push("цену");
  if (vehicle.engineCc || vehicle.engineLiters) prepared.push("двигатель");
  if (vehicle.horsepower) prepared.push("мощность");
  if (vehicle.year) prepared.push("год");
  if (prepared.length) {
    lines.push(`Для расчета уже подставил: ${prepared.join(", ")}.`);
  } else {
    lines.push("Часть данных для расчета придется уточнить вручную.");
  }
  const missingForCalculation = [];
  if (!vehicle.priceUsd) missingForCalculation.push("цену");
  if (!vehicle.engineCc && !vehicle.engineLiters) missingForCalculation.push("объем двигателя");
  if (!vehicle.horsepower) missingForCalculation.push("мощность");
  if (!vehicle.year) missingForCalculation.push("год");
  if (missingForCalculation.length) {
    lines.push(`Уточним вручную: ${missingForCalculation.join(", ")}, а также доставку по США и океан.`);
  } else {
    lines.push("Основные данные подставлены. Доставку по США и океан уточним отдельными шагами.");
  }
  return lines.join("\n");
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function getPlaywrightLaunchOptions(options = {}) {
  const browserName = options.browserName || process.env.PLAYWRIGHT_BROWSER || "chromium";
  const headless = options.headless ?? parseBooleanEnv(process.env.PLAYWRIGHT_HEADLESS, true);
  const channel = options.channel || process.env.PLAYWRIGHT_CHANNEL || undefined;

  return {
    browserName,
    headless,
    channel
  };
}

function detectEdmundsAccessDenied(html, pageTitle = "") {
  const title = String(pageTitle || "").toLowerCase();
  const body = String(html || "").toLowerCase();

  return (
    title.includes("access denied") ||
    body.includes("access denied") ||
    body.includes("reference id") ||
    body.includes("don't have permission to access this page")
  );
}

function getEdmundsFetchMode(options = {}) {
  return options.fetchMode || process.env.EDMUNDS_FETCH_MODE || "auto";
}

async function fetchHtmlWithFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = await response.text();
    const hasVehicleData = hasEdmundsVehicleData(html);
    if (!response.ok && !hasVehicleData) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    if (detectEdmundsAccessDenied(html) && !hasVehicleData) {
      const error = new Error("Access Denied");
      error.status = response.status;
      throw error;
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlWithPlaywright(url, options = {}) {
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    throw new Error("Playwright не установлен. Выполни: npm install && npx playwright install chromium");
  }

  const { browserName, headless, channel } = getPlaywrightLaunchOptions(options);
  const browserType = playwright[browserName];
  if (!browserType) {
    throw new Error(`Неизвестный Playwright browser: ${browserName}. Используй chromium, firefox или webkit.`);
  }

  const timeoutMs = Number(options.timeoutMs || process.env.PLAYWRIGHT_TIMEOUT_MS || 20000);
  const browser = await browserType.launch({
    headless,
    ...(channel ? { channel } : {})
  });

  // По официальному паттерну Playwright создаем отдельный non-persistent context.
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1440, height: 1000 }
  });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
    const html = await page.content();
    const liveMarkup = [];
    const fieldSelectors = [
      '[data-test="vdp-price-row"]',
      '[data-testid="vdp-price-row"]',
      '[data-test="vdp-price"]',
      '[data-testid="vdp-price"]',
      '[data-test="vdp-mileage-row"]',
      '[data-testid="vdp-mileage-row"]',
      '[data-test="vdp-mileage"]',
      '[data-testid="vdp-mileage"]',
      '[data-test="vehicle-mileage"]',
      '[data-testid="vehicle-mileage"]',
      '[data-test="vdp-trim"]',
      '[data-testid="vdp-trim"]',
      '[data-test="vehicle-trim"]',
      '[data-testid="vehicle-trim"]',
      '[data-test="vdp-transmission"]',
      '[data-testid="vdp-transmission"]',
      '[data-test="vdp-drivetrain"]',
      '[data-testid="vdp-drivetrain"]',
      '[data-test="vdp-engine"]',
      '[data-testid="vdp-engine"]',
      '[data-test="vdp-horsepower"]',
      '[data-testid="vdp-horsepower"]'
    ];

    // Read live DOM nodes as well as serialized HTML. This covers fields
    // rendered after hydration or inside an open shadow root.
    for (const selector of fieldSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        liveMarkup.push(await locator.evaluate((element) => element.outerHTML));
      }
    }

    const liveImageUrls = await page.locator("img").evaluateAll((images) => images
      .flatMap((image) => [image.currentSrc, image.src, image.getAttribute("data-src")])
      .filter(Boolean));

    // Even a blocked response can contain useful server-rendered fields.
    // The parser decides whether the HTML has enough data to use.
    return [html, ...liveMarkup, ...liveImageUrls].join("\n");
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

async function loadEdmundsHtml(url, options = {}) {
  const mode = getEdmundsFetchMode(options);

  if (mode === "playwright") {
    return fetchHtmlWithPlaywright(url, options);
  }

  if (mode === "auto") {
    try {
      return await fetchHtmlWithFetch(url);
    } catch {
      return fetchHtmlWithPlaywright(url, options);
    }
  }

  return fetchHtmlWithFetch(url);
}

async function importEdmundsListing(url, options = {}) {
  let listingVehicle = null;
  let importWarning = null;

  try {
    const html = await loadEdmundsHtml(url, options);
    listingVehicle = parseEdmundsVehicleFromHtml(html, url);

    if (detectEdmundsAccessDenied(html)) {
      const missing = [];
      if (!listingVehicle.priceUsd) missing.push("цену");
      if (!listingVehicle.mileage) missing.push("пробег");
      if (!listingVehicle.photos?.length) missing.push("фото");
      if (missing.length) {
        importWarning = `Edmunds вернул страницу с ограничением доступа, но часть данных из HTML удалось прочитать. Не удалось получить: ${missing.join(", ")}.`;
      }
    }
  } catch (error) {
    if (getEdmundsFetchMode(options) === "fetch") {
      const statusNote = error.status ? ` ${error.status}` : "";
      importWarning = `Edmunds заблокировал прямой запрос бота или страница не отдала HTML:${statusNote} ${error.message}. Поэтому цену и пробег мог не отдать, продолжаю по VIN и URL.`
        .replace(/\s+/g, " ")
        .trim();
    } else {
      importWarning = `Playwright не смог разобрать страницу Edmunds: ${error.message}. Поэтому цену и пробег мог не отдать, продолжаю по VIN и URL.`;
    }
  }

  listingVehicle = listingVehicle || parseEdmundsVehicleFromUrl(url);
  if (!listingVehicle) {
    throw new Error("Не удалось извлечь данные из ссылки Edmunds.");
  }

  let vinVehicle = null;
  if (listingVehicle.vin) {
    try {
      vinVehicle = await decodeVin(listingVehicle.vin);
    } catch (error) {
      importWarning = importWarning || `VIN удалось прочитать из ссылки, но декодер NHTSA не ответил: ${error.message}`;
    }
  }

  const vehicle = mergeVehicleData(listingVehicle, vinVehicle);
  return {
    vehicle: {
      ...vehicle,
      title: buildVehicleTitle(vehicle),
      importWarning
    },
    data: buildPrefilledCalculationData(vehicle)
  };
}

async function importListingFromUrl(text, options = {}) {
  const url = parseUrl(text);
  if (!url) throw new Error("Не похоже на ссылку.");
  if (!isSupportedListingUrl(url.href)) {
    throw new Error("Пока поддерживаю только ссылки Edmunds с VIN-страницей.");
  }
  return importEdmundsListing(url.href, options);
}

module.exports = {
  buildPrefilledCalculationData,
  buildVehicleTitle,
  detectEdmundsAccessDenied,
  extractEdmundsPhotoUrls,
  fetchHtmlWithPlaywright,
  formatImportedVehicle,
  getEdmundsFetchMode,
  getPlaywrightLaunchOptions,
  importListingFromUrl,
  isSupportedListingUrl,
  mergeVehicleData,
  parseEdmundsVehicleFromHtml
};
