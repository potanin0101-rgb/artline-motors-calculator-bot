function moneyRub(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function moneyUsd(value) {
  return `$${Math.round(value).toLocaleString("ru-RU")}`;
}

function numberRu(value, digits = 2) {
  return Number(value).toLocaleString("ru-RU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function destinationName(code) {
  return code === "rostov" ? "Ростов-на-Дону" : "Москва";
}

function ageText(months) {
  const years = Math.floor(months / 12);
  const restMonths = months % 12;
  if (years <= 0) return `${restMonths} мес.`;
  return `${years} г. ${restMonths} мес.`;
}

function formatResult(result) {
  const lines = [];
  lines.push(`Итог до города: ${moneyRub(result.totalRub)}`);
  lines.push("");
  lines.push(`Город: ${destinationName(result.input.destination)}`);
  lines.push(`Возраст авто: ${ageText(result.duty.ageMonths)}`);
  lines.push(`Курс: USD ${numberRu(result.rates.usdRub)} ₽, EUR ${numberRu(result.rates.eurRub)} ₽`);
  lines.push("");
  lines.push("Расходы в USD:");
  lines.push(`Авто: ${moneyUsd(result.usd.carPriceUsd)}`);
  lines.push(`Выкуп у дилера 1.5%: ${moneyUsd(result.usd.dealerBuyoutUsd)}`);
  lines.push(`Комиссия партнера: ${moneyUsd(result.usd.alexFeeUsd)}`);
  lines.push(`Доставка по США до порта: ${moneyUsd(result.usd.usInlandUsd)}`);
  lines.push(`Океан: ${moneyUsd(result.usd.oceanUsd)}`);
  lines.push(`Вывод USDT 1.5%: ${moneyUsd(result.usd.usdtWithdrawalUsd)}`);
  lines.push(`Брокер РФ: ${moneyUsd(result.usd.brokerRussiaUsd)}`);
  lines.push(`Итого USD-часть: ${moneyRub(result.usd.usdPartRub)}`);
  lines.push("");
  lines.push("РФ-платежи:");
  lines.push(`Пошлина: ${moneyRub(result.rub.dutyRub)} (${result.duty.dutyRule})`);
  lines.push(`Таможенное оформление: ${moneyRub(result.rub.clearanceFeeRub)}`);
  lines.push(`Утильсбор: ${moneyRub(result.rub.utilizationRub)} (коэф. ${numberRu(result.utilization.coefficient, 2)})`);
  lines.push(`Лаборатория РФ: ${moneyRub(result.rub.labRussiaRub)}`);
  lines.push(`Доставка в город: ${moneyRub(result.rub.destinationRub)}`);
  lines.push(`Твоя комиссия: ${moneyRub(result.rub.commissionRub)}`);
  return lines.join("\n");
}

module.exports = {
  moneyRub,
  moneyUsd,
  numberRu,
  destinationName,
  formatResult
};
