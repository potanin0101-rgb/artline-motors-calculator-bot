const assert = require("node:assert/strict");
const { calculateImport, getDutyEur, getUtilizationFee, getCustomsClearanceFeeRub } = require("../src/calculator");

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

console.log("calculator tests passed");
