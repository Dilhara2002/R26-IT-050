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

const {
  formatAvailableTime,
  itineraryRequestError,
  parseAvailableTime,
  parseOptionalRadius,
  parseStartingCoordinates,
  validateItineraryForm,
} = loadExpoModule("../services/itineraryValidation.js");
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

test("complete form validation handles blank, coordinate, interest, time, and radius errors", () => {
  const blank = validateItineraryForm({
    preferences: [], hours: " ", minutes: " ", latitude: " ", longitude: " ", radius: " ",
  });
  assert.equal(blank.valid, false);
  assert.equal(blank.firstInvalidField, "latitude");
  assert.match(blank.errors.preferences, /at least one/i);
  assert.match(blank.errors.latitude, /required/i);
  assert.match(blank.errors.time, /greater than zero/i);
  for (const values of [["north", "80"], ["NaN", "80"], ["Infinity", "80"], ["91", "80"], ["7", "181"]]) {
    assert.throws(() => parseStartingCoordinates(...values));
  }
  assert.deepEqual(parseStartingCoordinates(" 7.2906 ", " 80.6337 "), { latitude: 7.2906, longitude: 80.6337 });
  assert.equal(parseOptionalRadius(""), null);
  assert.equal(parseOptionalRadius("15.5"), 15.5);
  for (const radius of ["0", "-1", "101", "NaN", "Infinity", "many"]) assert.throws(() => parseOptionalRadius(radius));
  assert.equal(formatAvailableTime(150), "2 hours 30 minutes");
});

test("valid form preserves the backend payload units", () => {
  const result = validateItineraryForm({
    preferences: ["Nature"], hours: "2", minutes: "30",
    latitude: "7.2906", longitude: "80.6337", radius: "15",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.values, {
    preferences: ["Nature"], totalMinutes: 150,
    latitude: 7.2906, longitude: 80.6337, radiusKm: 15,
  });
});

test("request failures distinguish invalid input, outage, feasibility, and exhaustion", () => {
  assert.equal(itineraryRequestError({}).kind, "service_unavailable");
  assert.equal(itineraryRequestError({ response: { status: 400, data: {} } }).kind, "invalid_input");
  assert.equal(itineraryRequestError({ response: { status: 404, data: {} } }).kind, "no_feasible_itinerary");
  assert.equal(itineraryRequestError({ response: { status: 409, data: { code: "no_additional_feasible_alternative" } } }).kind, "exhausted");
  assert.equal(itineraryRequestError({ response: { status: 500, data: {} } }).kind, "unexpected_server_error");
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
  const homeSource = fs.readFileSync(path.resolve(__dirname, "../screens/HomeScreen.js"), "utf8");
  const mapSource = fs.readFileSync(path.resolve(__dirname, "../screens/MapScreen.js"), "utf8");
  const webMapSource = fs.readFileSync(path.resolve(__dirname, "../components/ResultMap.web.js"), "utf8");
  assert.match(resultSource, /if \(busy\) return/);
  assert.match(resultSource, /navigation\.navigate\("Safety", \{ itinerarySafetyRequest: payload \}\)/);
  assert.match(appSource, /route\.params\?\.itinerarySafetyRequest/);
  assert.match(appSource, /recommendItinerarySafety\(itineraryRequest\)/);
  assert.match(resultSource, /Why this route was selected/);
  assert.match(homeSource, /if \(loading\) return/);
  assert.match(homeSource, /Maximum radius \(km\)/);
  assert.match(homeSource, /accessibilityRole="checkbox"/);
  assert.match(resultSource, /Optional AI Tour Guide/);
  assert.match(resultSource, /Open current visitor-information source/);
  assert.match(resultSource, /Risk evidence may be unavailable or incomplete/);
  assert.match(mapSource, /Estimated Itinerary Map/);
  assert.doesNotMatch(mapSource, /Live Route View/);
  assert.match(webMapSource, /OpenStreetMap contributors/);
  assert.match(webMapSource, /dashArray/);
});
