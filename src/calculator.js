const DEFAULT_CONFIG = {
  dealerBuyoutRate: 0.015,
  alexFeeBelow100kUsd: 3500,
  alexFeeAbove100kUsd: 4500,
  usdtWithdrawalRate: 0.015,
  brokerRussiaUsd: 1000,
  labRussiaRub: 80000,
  cityDeliveryRub: {
    rostov: 30000,
    moscow: 80000
  }
};

const HP_PER_KW = 1.3596216173;
const UTIL_BASE_RUB = 20000;

const DUTY_UNDER_3 = [
  { maxEur: 8500, percent: 0.54, minEurPerCc: 2.5 },
  { maxEur: 16700, percent: 0.48, minEurPerCc: 3.5 },
  { maxEur: 42300, percent: 0.48, minEurPerCc: 5.5 },
  { maxEur: 84500, percent: 0.48, minEurPerCc: 7.5 },
  { maxEur: 169000, percent: 0.48, minEurPerCc: 15 },
  { maxEur: Infinity, percent: 0.48, minEurPerCc: 20 }
];

const DUTY_3_TO_5 = [
  { maxCc: 1000, eurPerCc: 1.5 },
  { maxCc: 1500, eurPerCc: 1.7 },
  { maxCc: 1800, eurPerCc: 2.5 },
  { maxCc: 2300, eurPerCc: 2.7 },
  { maxCc: 3000, eurPerCc: 3.0 },
  { maxCc: Infinity, eurPerCc: 3.6 }
];

const DUTY_OVER_5 = [
  { maxCc: 1000, eurPerCc: 3.0 },
  { maxCc: 1500, eurPerCc: 3.2 },
  { maxCc: 1800, eurPerCc: 3.5 },
  { maxCc: 2300, eurPerCc: 4.8 },
  { maxCc: 3000, eurPerCc: 5.0 },
  { maxCc: Infinity, eurPerCc: 5.7 }
];

const CUSTOMS_FEES_2026 = [
  { maxRub: 200000, feeRub: 1231 },
  { maxRub: 450000, feeRub: 2462 },
  { maxRub: 1200000, feeRub: 4924 },
  { maxRub: 2700000, feeRub: 13541 },
  { maxRub: 4200000, feeRub: 18465 },
  { maxRub: 5500000, feeRub: 21344 },
  { maxRub: 10000000, feeRub: 49240 },
  { maxRub: Infinity, feeRub: 73860 }
];

const KW_BINS = [
  51.48,
  73.55,
  95.61,
  117.68,
  139.75,
  161.81,
  183.88,
  205.94,
  228.0,
  250.07,
  272.13,
  294.2,
  316.26,
  338.33,
  367.75,
  Infinity
];

// 2026 coefficients from RF Government Decree No. 1291, M1 ICE rows.
const UTIL_2026_ICE = [
  {
    maxCc: 1000,
    pairs: [
      [0.17, 0.26], [0.17, 0.26], [0.17, 0.26], [0.17, 0.26],
      [15.36, 28.44], [15.84, 29.28], [16.2, 30.12], [17.28, 30.12],
      [17.28, 30.12], [17.28, 30.12], [17.28, 30.12], [17.28, 30.12],
      [17.28, 30.12], [17.28, 30.12], [17.28, 30.12], [17.28, 30.12]
    ]
  },
  {
    maxCc: 2000,
    pairs: [
      [0.17, 0.26], [0.17, 0.26], [0.17, 0.26], [0.17, 0.26],
      [45, 74.64], [47.64, 79.2], [50.52, 83.88], [57.12, 91.92],
      [64.56, 100.56], [72.96, 110.16], [83.16, 120.6], [94.8, 132],
      [108, 144.6], [123.24, 158.4], [140.4, 173.4], [160.08, 189.84]
    ]
  },
  {
    maxCc: 3000,
    pairs: [
      [0.17, 0.26], [0.17, 0.26], [0.17, 0.26], [0.17, 0.26],
      [115.34, 172.8], [118.2, 175.08], [120.12, 177.6], [126, 183],
      [131.04, 188.52], [136.32, 193.68], [141.72, 199.08], [147.48, 204.72],
      [153.12, 210.6], [158.88, 216.6], [165.6, 224.4], [174.24, 235.2]
    ]
  },
  {
    maxCc: 3500,
    pairs: [
      [129.2, 197.81], [129.2, 197.81], [129.2, 197.81], [129.2, 197.81],
      [131.76, 200.04], [134.4, 202.2], [137.16, 204.36], [140.52, 207.24],
      [144, 212.4], [151.92, 217.8], [160.32, 224.28], [169.2, 231],
      [178.44, 237.96], [188.28, 245.04], [198.6, 252.48], [209.52, 260.04]
    ]
  },
  {
    maxCc: Infinity,
    pairs: [
      [164.53, 216.29], [164.53, 216.29], [164.53, 216.29], [164.53, 216.29],
      [167.28, 219.48], [170.16, 222.84], [173.04, 226.2], [176.52, 231.36],
      [180, 236.64], [186.36, 249.6], [192.88, 263.4], [199.68, 277.92],
      [206.64, 293.16], [213.84, 309.36], [221.28, 326.4], [229.08, 344.28]
    ]
  }
];

function roundRub(value) {
  return Math.round(value);
}

function ageMonths(year, month, asOf = new Date()) {
  const currentYear = asOf.getFullYear();
  const currentMonth = asOf.getMonth() + 1;
  return (currentYear - year) * 12 + (currentMonth - month);
}

function ageBucket(months) {
  if (months < 36) return "under3";
  if (months < 60) return "3to5";
  return "over5";
}

function getDutyEur({ carPriceUsd, engineCc, productionYear, productionMonth, usdRub, eurRub, asOf }) {
  const months = ageMonths(productionYear, productionMonth, asOf);
  if (months < 0) {
    throw new Error("Дата выпуска автомобиля не может быть в будущем.");
  }

  const bucket = ageBucket(months);
  const customsValueRub = carPriceUsd * usdRub;
  const customsValueEur = customsValueRub / eurRub;

  if (bucket === "under3") {
    const row = DUTY_UNDER_3.find((item) => customsValueEur <= item.maxEur);
    const byPercent = customsValueEur * row.percent;
    const byEngine = engineCc * row.minEurPerCc;
    return {
      dutyEur: Math.max(byPercent, byEngine),
      customsValueEur,
      customsValueRub,
      ageMonths: months,
      ageBucket: bucket,
      dutyRule: `${Math.round(row.percent * 100)}%, min ${row.minEurPerCc} EUR/cc`
    };
  }

  const table = bucket === "3to5" ? DUTY_3_TO_5 : DUTY_OVER_5;
  const row = table.find((item) => engineCc <= item.maxCc);
  return {
    dutyEur: engineCc * row.eurPerCc,
    customsValueEur,
    customsValueRub,
    ageMonths: months,
    ageBucket: bucket,
    dutyRule: `${row.eurPerCc} EUR/cc`
  };
}

function getCustomsClearanceFeeRub(customsValueRub) {
  return CUSTOMS_FEES_2026.find((item) => customsValueRub <= item.maxRub).feeRub;
}

function getUtilizationFee({ engineCc, horsepower, productionYear, productionMonth, asOf }) {
  const months = ageMonths(productionYear, productionMonth, asOf);
  const isNewForUtil = months <= 36;
  const kw = horsepower / HP_PER_KW;
  const binIndex = KW_BINS.findIndex((maxKw) => kw <= maxKw);
  const volumeRow = UTIL_2026_ICE.find((row) => engineCc <= row.maxCc);
  const pair = volumeRow.pairs[binIndex];
  const coefficient = isNewForUtil ? pair[0] : pair[1];

  return {
    feeRub: roundRub(UTIL_BASE_RUB * coefficient),
    coefficient,
    baseRub: UTIL_BASE_RUB,
    kw,
    isNewForUtil
  };
}

function calculateImport(input, rates, config = DEFAULT_CONFIG) {
  const usdRub = Number(rates.usdRub);
  const eurRub = Number(rates.eurRub);
  if (!usdRub || !eurRub) throw new Error("Не задан курс USD/RUB или EUR/RUB.");

  const alexFeeUsd = input.carPriceUsd > 100000
    ? config.alexFeeAbove100kUsd
    : config.alexFeeBelow100kUsd;
  const dealerBuyoutUsd = input.carPriceUsd * config.dealerBuyoutRate;
  const oceanUsd = input.oceanUsd ?? Number(process.env.DEFAULT_OCEAN_USD || 6500);
  const usInlandUsd = input.usInlandUsd ?? Number(process.env.DEFAULT_US_INLAND_USD || 1000);

  const usdBeforeWithdrawal = input.carPriceUsd + dealerBuyoutUsd + alexFeeUsd + usInlandUsd + oceanUsd;
  const usdtWithdrawalUsd = usdBeforeWithdrawal * config.usdtWithdrawalRate;
  const usdTotal = usdBeforeWithdrawal + usdtWithdrawalUsd + config.brokerRussiaUsd;

  const duty = getDutyEur({
    carPriceUsd: input.carPriceUsd,
    engineCc: input.engineCc,
    productionYear: input.productionYear,
    productionMonth: input.productionMonth,
    usdRub,
    eurRub,
    asOf: input.asOf
  });
  const dutyRub = duty.dutyEur * eurRub;
  const clearanceFeeRub = getCustomsClearanceFeeRub(duty.customsValueRub);
  const utilization = getUtilizationFee({
    engineCc: input.engineCc,
    horsepower: input.horsepower,
    productionYear: input.productionYear,
    productionMonth: input.productionMonth,
    asOf: input.asOf
  });

  const destinationRub = config.cityDeliveryRub[input.destination];
  if (!destinationRub) throw new Error("Неизвестный город доставки.");

  const usdPartRub = usdTotal * usdRub;
  const totalRub = usdPartRub
    + dutyRub
    + clearanceFeeRub
    + utilization.feeRub
    + config.labRussiaRub
    + destinationRub
    + input.commissionRub;

  return {
    input: { ...input, usInlandUsd, oceanUsd },
    rates: { ...rates, usdRub, eurRub },
    usd: {
      carPriceUsd: input.carPriceUsd,
      dealerBuyoutUsd,
      alexFeeUsd,
      usInlandUsd,
      oceanUsd,
      usdBeforeWithdrawal,
      usdtWithdrawalUsd,
      brokerRussiaUsd: config.brokerRussiaUsd,
      usdTotal,
      usdPartRub
    },
    rub: {
      dutyRub,
      clearanceFeeRub,
      utilizationRub: utilization.feeRub,
      labRussiaRub: config.labRussiaRub,
      destinationRub,
      commissionRub: input.commissionRub,
      totalRub: roundRub(totalRub)
    },
    duty: {
      ...duty,
      dutyRub: roundRub(dutyRub)
    },
    utilization,
    totalRub: roundRub(totalRub)
  };
}

module.exports = {
  DEFAULT_CONFIG,
  calculateImport,
  getDutyEur,
  getUtilizationFee,
  getCustomsClearanceFeeRub,
  ageMonths,
  ageBucket,
  roundRub
};
