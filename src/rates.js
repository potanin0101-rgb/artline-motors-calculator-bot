function parseCbrRate(xml, charCode) {
  const blockRe = new RegExp(`<Valute[^>]*>[^]*?<CharCode>${charCode}</CharCode>[^]*?</Valute>`, "i");
  const block = xml.match(blockRe)?.[0];
  if (!block) return null;
  const nominal = Number(block.match(/<Nominal>(\d+)<\/Nominal>/i)?.[1] || 1);
  const valueText = block.match(/<Value>([^<]+)<\/Value>/i)?.[1];
  if (!valueText) return null;
  return Number(valueText.replace(",", ".")) / nominal;
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
    const usdRub = parseCbrRate(xml, "USD");
    const eurRub = parseCbrRate(xml, "EUR");
    if (!usdRub || !eurRub) throw new Error("Не удалось прочитать курсы ЦБ.");
    return { usdRub, eurRub, source: "CBR" };
  } finally {
    clearTimeout(timeout);
  }
}

async function getRates() {
  const fallbackUsd = Number(process.env.USD_RUB);
  const fallbackEur = Number(process.env.EUR_RUB);

  try {
    return await fetchCbrRates();
  } catch (error) {
    if (fallbackUsd && fallbackEur) {
      return {
        usdRub: fallbackUsd,
        eurRub: fallbackEur,
        source: "ENV",
        warning: `Курс ЦБ недоступен, использую fallback: ${error.message}`
      };
    }
    throw error;
  }
}

module.exports = { getRates, fetchCbrRates, parseCbrRate };
