const assert = require("node:assert/strict");
const { calculateImport, getDutyEur, getUtilizationFee, getCustomsClearanceFeeRub } = require("../src/calculator");
const { formatResult } = require("../src/format");
const { buildPrefilledCalculationData, mergeVehicleData, parseEdmundsVehicleFromHtml } = require("../src/listing");
const { applyRateMarkup, parseCbrRate, RATE_MARKUP_FACTOR } = require("../src/rates");

const rates = { usdRub: 92, eurRub: 100 };
const detailedRates = {
  usdRub: 74.5735,
  eurRub: 86.7687,
  baseUsdRub: 71.0224,
  baseEurRub: 82.6369,
  source: "CBR",
  date: "30.05.2026",
  markupPercent: 5
};
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
  }, detailedRates);

  assert.equal(result.rates.date, "30.05.2026");
  assert.equal(result.rates.baseUsdRub, 71.0224);
  assert.equal(result.rates.baseEurRub, 82.6369);
  assert.equal(result.rates.markupPercent, 5);
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

{
  const html = `<!DOCTYPE html>
  <html>
    <head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Vehicle",
              "brand": { "@type": "Brand", "name": "Honda" },
              "model": "HR-V",
              "vehicleModelDate": "2024",
              "name": "2024 Honda HR-V LX",
              "driveWheelConfiguration": "all wheel drive",
              "vehicleTransmission": "Automatic",
              "vehicleIdentificationNumber": "3CZRZ2H35RM714945",
              "color": "Modern Steel Metallic",
              "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 40067, "unitCode": "SMI" },
              "vehicleInteriorColor": "Black cloth",
              "offers": { "@type": "Offer", "price": 21388, "priceCurrency": "USD" },
              "vehicleEngine": {
                "@type": "EngineSpecification",
                "engineType": "gas",
                "fuelType": "regular unleaded",
                "enginePower": { "@type": "QuantitativeValue", "value": 158, "unitText": "horsepower" },
                "engineDisplacement": { "@type": "QuantitativeValue", "value": 2, "unitCode": "LTR" }
              },
              "bodyType": "SUV"
            }
          ]
        }
      </script>
    </head>
  </html>`;

  const listingVehicle = parseEdmundsVehicleFromHtml(html, "https://www.edmunds.com/honda/hr-v/2024/vin/3CZRZ2H35RM714945/");
  assert.equal(listingVehicle.title, "2024 Honda HR-V LX");
  assert.equal(listingVehicle.vin, "3CZRZ2H35RM714945");
  assert.equal(listingVehicle.priceUsd, 21388);
  assert.equal(listingVehicle.mileage, 40067);
  assert.equal(listingVehicle.engineCc, 2000);
  assert.equal(listingVehicle.horsepower, 158);

  const mergedVehicle = mergeVehicleData(listingVehicle, {
    vin: "3CZRZ2H35RM714945",
    make: "HONDA",
    model: "HR-V",
    trim: "LX",
    year: 2024,
    engineCc: 2000,
    engineLiters: 2,
    horsepower: 158,
    fuelType: "Gasoline",
    drivetrain: "4WD/4-Wheel Drive/4x4",
    transmission: "Continuously Variable Transmission (CVT)",
    bodyType: "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)"
  });

  assert.equal(mergedVehicle.trim, "LX");
  assert.equal(mergedVehicle.transmission, "Continuously Variable Transmission (CVT)");
  assert.equal(mergedVehicle.drivetrain, "4WD/4-Wheel Drive/4x4");

  const draft = buildPrefilledCalculationData(mergedVehicle);
  assert.equal(draft.carPriceUsd, 21388);
  assert.equal(draft.engineCc, 2000);
  assert.equal(draft.horsepower, 158);
  assert.equal(draft.productionYear, 2024);
  assert.equal(draft.usInlandUsd, 1000);
  assert.equal(draft.oceanUsd, 6500);
}

{
  const result = calculateImport({
    carPriceUsd: 21388,
    engineCc: 2000,
    horsepower: 158,
    productionYear: 2024,
    productionMonth: 1,
    usInlandUsd: 1000,
    oceanUsd: 6500,
    commissionRub: 150000,
    destination: "rostov",
    vehicle: {
      title: "2024 Honda HR-V LX",
      vin: "3CZRZ2H35RM714945",
      mileage: 40067,
      engineLiters: 2,
      horsepower: 158,
      drivetrain: "4WD/4-Wheel Drive/4x4"
    },
    asOf
  }, detailedRates);

  const text = formatResult(result);
  assert.match(text, /Авто: 2024 Honda HR-V LX/);
  assert.match(text, /VIN: 3CZRZ2H35RM714945/);
  assert.match(text, /Пробег: 40[\s\u00A0]067 mi/);
  assert.match(text, /Курс ЦБ РФ на 30\.05\.2026 \+ 5%/);
}

console.log("calculator tests passed");
