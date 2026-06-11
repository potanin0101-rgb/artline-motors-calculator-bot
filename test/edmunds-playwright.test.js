const assert = require("node:assert/strict");
const { importListingFromUrl } = require("../src/listing");

const url = process.env.EDMUNDS_TEST_URL || "https://www.edmunds.com/honda/hr-v/2024/vin/3CZRZ2H35RM714945/";

(async () => {
  const imported = await importListingFromUrl(url, {
    fetchMode: "playwright",
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false"
  });

  assert.ok(imported.vehicle, "vehicle should be parsed");
  assert.ok(imported.vehicle.vin, "VIN should be parsed from Edmunds URL/page");
  assert.ok(imported.vehicle.title, "title should be available");

  console.log("playwright import test finished");
  console.log({
    title: imported.vehicle.title,
    vin: imported.vehicle.vin,
    priceUsd: imported.vehicle.priceUsd,
    mileage: imported.vehicle.mileage,
    engineCc: imported.vehicle.engineCc,
    horsepower: imported.vehicle.horsepower,
    warning: imported.vehicle.importWarning
  });
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
