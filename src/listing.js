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
  const normalized = String(value ?? "")
    .replace(/,/g, ".")
    .replace(/[^\d.]/g, "");
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

function parseEdmundsVehicleFromHtml(html, pageUrl = null) {
  const entries = extractJsonLdObjects(html).flatMap(flattenGraphEntries);
  const vehicle = entries.find((entry) => entry?.["@type"] === "Vehicle");
  if (!vehicle) {
    throw new Error("Не удалось найти блок данных автомобиля на странице Edmunds.");
  }

  const title = vehicle.name || null;
  const year = parseNumber(vehicle.vehicleModelDate || vehicle.productionDate);
  const priceUsd = parseNumber(vehicle.offers?.price);
  const mileage = parseNumber(vehicle.mileageFromOdometer?.value);
  const horsepower = parseNumber(vehicle.vehicleEngine?.enginePower?.value);
  const engineLiters = parseNumber(vehicle.vehicleEngine?.engineDisplacement?.value);
  const engineCc = engineLiters ? Math.round(engineLiters * 1000) : null;

  const trimFromTitle = title?.match(/^\d{4}\s+\S+\s+\S+\s+(.+)$/)?.[1] || null;

  return {
    source: "Edmunds",
    sourceUrl: pageUrl,
    title,
    vin: vehicle.vehicleIdentificationNumber || null,
    stockNumber: vehicle.sku || null,
    year: year ? Math.round(year) : null,
    make: vehicle.brand?.name || vehicle.manufacturer || null,
    model: vehicle.model || null,
    trim: trimFromTitle,
    priceUsd,
    mileage,
    drivetrain: vehicle.driveWheelConfiguration || null,
    transmission: vehicle.vehicleTransmission || null,
    bodyType: vehicle.bodyType || null,
    fuelType: vehicle.vehicleEngine?.fuelType || vehicle.vehicleEngine?.engineType || null,
    horsepower: horsepower ? Math.round(horsepower) : null,
    engineLiters,
    engineCc,
    exteriorColor: vehicle.color || null,
    interiorColor: vehicle.vehicleInteriorColor || null,
    vehicleConfiguration: vehicle.vehicleConfiguration || null
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
    vehicleConfiguration: null
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
    bodyType: vinVehicle.bodyType || base.bodyType
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
  lines.push("Цену, если ее не удалось прочитать, а также доставку по США и океан уточним отдельными шагами.");
  return lines.join("\n");
}

async function importEdmundsListing(url) {
  let listingVehicle = null;
  let importWarning = null;

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

    if (response.ok) {
      const html = await response.text();
      listingVehicle = parseEdmundsVehicleFromHtml(html, url);
    } else {
      importWarning = `Edmunds заблокировал прямой запрос бота и вернул ${response.status} (Akamai). Поэтому цену и пробег мог не отдать, продолжаю по VIN и URL.`;
    }
  } finally {
    clearTimeout(timeout);
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

async function importListingFromUrl(text) {
  const url = parseUrl(text);
  if (!url) throw new Error("Не похоже на ссылку.");
  if (!isSupportedListingUrl(url.href)) {
    throw new Error("Пока поддерживаю только ссылки Edmunds с VIN-страницей.");
  }
  return importEdmundsListing(url.href);
}

module.exports = {
  buildPrefilledCalculationData,
  buildVehicleTitle,
  formatImportedVehicle,
  importListingFromUrl,
  isSupportedListingUrl,
  mergeVehicleData,
  parseEdmundsVehicleFromHtml
};
