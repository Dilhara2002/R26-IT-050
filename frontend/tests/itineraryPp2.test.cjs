const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");

function loadExpoModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const transformed = babel.transformFileSync(filename, {
    presets: ["babel-preset-expo"],
    babelrc: false,
    configFile: false,
  }).code;
  const module = { exports: {} };
  new Function("module", "exports", "require", transformed)(module, module.exports, require);
  return module.exports;
}

const { parseAvailableTime } = loadExpoModule("../services/itineraryValidation.js");
const {
  buildItinerarySafetyRequest,
  getItinerarySafetyAvailability,
} = loadExpoModule("../services/safetyApi.js");

const startingLocation = { lat: 7.2906, lon: 80.6337, name: "Kandy start" };
const optimizedStops = [
  { sequence: 1, place_id: "lake", name: "Kandy Lake", latitude: 7.2917, longitude: 80.6396, duration_minutes: 60 },
  { sequence: 2, place_id: "garden", name: "Royal Botanic Gardens", latitude: 7.27, longitude: 80.6, duration_minutes: 150 },
];

test("hours and minutes validation rejects malformed, negative, zero, overflow, and excessive values", () => {
  assert.equal(parseAvailableTime("2", "30"), 150);
  for (const values of [["", ""], ["0", "0"], ["-1", "0"], ["a", "5"], ["1", "60"], ["24", "1"], ["1.5", "0"]]) {
    assert.throws(() => parseAvailableTime(...values));
  }
});

test("Safety payload uses exact structured route order and omits optional vehicle pair", () => {
  assert.equal(getItinerarySafetyAvailability(startingLocation, optimizedStops), "");
  const payload = buildItinerarySafetyRequest({ startingLocation, optimizedStops });
  assert.deepEqual(payload, {
    starting_location: startingLocation,
    optimized_stops: optimizedStops,
  });
});

test("Safety payload includes budget and passengers only as a pair", () => {
  assert.throws(
    () => buildItinerarySafetyRequest({ startingLocation, optimizedStops, budget: 25000 }),
    /supplied together/
  );
  const payload = buildItinerarySafetyRequest({
    startingLocation,
    optimizedStops,
    budget: 25000,
    passengers: 4,
    preferredCategory: "SUV",
  });
  assert.equal(payload.budget, 25000);
  assert.equal(payload.passengers, 4);
  assert.equal(payload.preferredCategory, "SUV");
});

test("route-param bridge, repeat-click guard, and truthful labels remain wired", () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, "../App.js"), "utf8");
  const resultSource = fs.readFileSync(path.resolve(__dirname, "../screens/ResultScreen.js"), "utf8");
  const mapSource = fs.readFileSync(path.resolve(__dirname, "../screens/MapScreen.js"), "utf8");
  const webMapSource = fs.readFileSync(path.resolve(__dirname, "../components/ResultMap.web.js"), "utf8");
  assert.match(resultSource, /if \(safetyLoading \|\| regenerationLoading\) return/);
  assert.match(resultSource, /navigation\.navigate\("Safety", \{ itinerarySafetyRequest: payload \}\)/);
  assert.match(appSource, /route\.params\?\.itinerarySafetyRequest/);
  assert.match(appSource, /recommendItinerarySafety\(itineraryRequest\)/);
  assert.match(resultSource, /Why this route was selected/);
  assert.match(resultSource, /Optional travel-guide explanation/);
  assert.match(resultSource, /Open POI source/);
  assert.match(mapSource, /Estimated Itinerary Map/);
  assert.doesNotMatch(mapSource, /Live Route View/);
  assert.match(webMapSource, /OpenStreetMap contributors/);
});
