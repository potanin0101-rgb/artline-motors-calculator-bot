const assert = require("node:assert/strict");
const { calculateImport, getDutyEur, getUtilizationFee, getCustomsClearanceFeeRub } = require("../src/calculator");
const { applyRateMarkup, parseCbrRate, RATE_MARKUP_FACTOR } = require("../src/rates");

const rates = { usdRub: 92, eurRub: 100 };
const asOf = new Date("2026-05-06T12:00:00+03:00");

{
  const duty = getDutyEur({
    carPriceUsd: 50000,
    engineCc: 1998,
    productionYear: 2024,
    productionMonth: 1,
    usdRub: rates.usdRub,
    eurRub: rates.eurRub,
    asOf
  });

  assert.equal(duty.ageBucket, "under3");
  assert.equal(Math.round(duty.dutyEur), 22080);
}

{
  const duty = getDutyEur({
    carPriceUsd: 30000,
    engineCc: 1998,
    productionYear: 2021,
    productionMonth: 4,
    usdRub: rates.usdRub,
    eurRub: rates.eurRub,
    asOf
  });

  assert.equal(duty.ageBucket, "over5");
  assert.equal(duty.dutyEur, 1998 * 4.8);
}

{
  const util = getUtilizationFee({
    engineCc: 1998,
    horsepower: 249,
    productionYear: 2024,
    productionMonth: 1,
    asOf
  });

  assert.equal(util.feeRub, 1010400);
  assert.equal(util.coefficient, 50.52);
}

{
  assert.equal(getCustomsClearanceFeeRub(4600000), 21344);
  assert.equal(getCustomsClearanceFeeRub(11000000), 73860);
}

{
  const result = calculateImport({
    carPriceUsd: 50000,
    engineCc: 1998,
    horsepower: 249,
    productionYear: 2024,
    productionMonth: 1,
    usInlandUsd: 1000,
    oceanUsd: 6500,
    commissionRub: 150000,
    destination: "rostov",
    asOf
  }, rates);

  assert.equal(result.usd.alexFeeUsd, 3500);
  assert.equal(result.duty.dutyRub, 2208000);
  assert.equal(result.rub.destinationRub, 30000);
  assert.equal(result.totalRub, 9357959);
  assert.ok(result.totalRub > 0);
  assert.ok(result.rub.utilizationRub > result.rub.clearanceFeeRub);
}

{
  const xml = `<?xml version="1.0" encoding="windows-1251"?>
  <ValCurs Date="30.05.2026" name="Foreign Currency Market">
    <Valute ID="R01235">
      <NumCode>840</NumCode>
      <CharCode>USD</CharCode>
      <Nominal>1</Nominal>
      <Value>71,0224</Value>
    </Valute>
    <Valute ID="R01239">
      <NumCode>978</NumCode>
      <CharCode>EUR</CharCode>
      <Nominal>1</Nominal>
      <Value>82,6369</Value>
    </Valute>
  </ValCurs>`;

  assert.equal(parseCbrRate(xml, "USD"), 71.0224);
  assert.equal(parseCbrRate(xml, "EUR"), 82.6369);
}

{
  assert.equal(RATE_MARKUP_FACTOR, 1.05);
  assert.equal(applyRateMarkup(100), 105);
  assert.equal(applyRateMarkup(71.0224), 74.5735);
}

console.log("calculator tests passed");
