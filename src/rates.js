const RATE_MARKUP_FACTOR = 1.05;

function getValuteBlock(xml, charCode) {
  const blocks = xml.match(/<Valute\b[^>]*>[\s\S]*?<\/Valute>/gi) || [];
  return blocks.find((block) => {
    const code = block.match(/<CharCode>([^<]+)<\/CharCode>/i)?.[1];
    return code === charCode;
  }) || null;
}

function parseCbrDate(xml) {
  return xml.match(/<ValCurs\b[^>]*Date="([^"]+)"/i)?.[1] || null;
}

function parseCbrRate(xml, charCode) {
  const block = getValuteBlock(xml, charCode);
  if (!block) return null;

  const nominal = Number(block.match(/<Nominal>(\d+)<\/Nominal>/i)?.[1] || 1);
  const valueText = block.match(/<Value>([^<]+)<\/Value>/i)?.[1];
  if (!valueText) return null;

  return Number(valueText.replace(",", ".")) / nominal;
}

function applyRateMarkup(rate) {
  return Number((rate * RATE_MARKUP_FACTOR).toFixed(4));
}

async function fetchCbrRates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://www.cbr.ru/scripts/XML_daily.asp", {
      signal: controller.signal,
      headers: { "User-Agent": "ArtlineMotorsBot/0.1" }
    });
    if (!response.ok) throw new Error(`CBR HTTP ${response.status}`);
    const xml = await response.text();
    const date = parseCbrDate(xml);
    const baseUsdRub = parseCbrRate(xml, "USD");
    const baseEurRub = parseCbrRate(xml, "EUR");
    if (!baseUsdRub || !baseEurRub) throw new Error("Не удалось прочитать курсы ЦБ.");
    return {
      usdRub: applyRateMarkup(baseUsdRub),
      eurRub: applyRateMarkup(baseEurRub),
      baseUsdRub,
      baseEurRub,
      source: "CBR",
      date,
      markupPercent: 5
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getRates() {
  const baseFallbackUsd = Number(process.env.USD_RUB);
  const baseFallbackEur = Number(process.env.EUR_RUB);

  try {
    return await fetchCbrRates();
  } catch (error) {
    if (baseFallbackUsd && baseFallbackEur) {
      return {
        usdRub: applyRateMarkup(baseFallbackUsd),
        eurRub: applyRateMarkup(baseFallbackEur),
        baseUsdRub: baseFallbackUsd,
        baseEurRub: baseFallbackEur,
        source: "ENV",
        markupPercent: 5,
        warning: `Курс ЦБ недоступен, использую fallback: ${error.message}`
      };
    }
    throw error;
  }
}

module.exports = {
  RATE_MARKUP_FACTOR,
  applyRateMarkup,
  getRates,
  fetchCbrRates,
  parseCbrRate
};
