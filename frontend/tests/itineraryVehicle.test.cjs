const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const babel = require("@babel/core");

const transformed = babel.transformFileSync(
  path.resolve(__dirname, "../services/itineraryVehicle.js"),
  { presets: ["babel-preset-expo"], babelrc: false, configFile: false }
).code;
const helperModule = { exports: {} };
new Function("module", "exports", "require", transformed)(helperModule, helperModule.exports, require);
const { buildItineraryVehiclePayload } = helperModule.exports;

const itinerary = {
  starting_location: { lat: 7.2906, lon: 80.6337 },
  optimized_stops: [
    { place_id: "poi-a", name: "Place A", latitude: 7.3, longitude: 80.64, duration_minutes: 60 },
    { place_id: "poi-b", name: "Place B", latitude: 7.31, longitude: 80.65, duration_minutes: 90 },
  ],
};

test("maps the ordered Sasanka itinerary into Ishan's whole-trip vehicle contract", () => {
  const payload = buildItineraryVehiclePayload(itinerary, {
    budget: "50000", passengers: "4", preferredCategory: "SUV",
  });
  assert.equal(payload.budget, 50000);
  assert.equal(payload.passengers, 4);
  assert.equal(payload.preferredCategory, "SUV");
  assert.deepEqual(payload.optimized_stops.map((stop) => stop.sequence), [1, 2]);
  assert.deepEqual(payload.optimized_stops.map((stop) => stop.place_id), ["poi-a", "poi-b"]);
});

test("keeps vehicle category optional", () => {
  const payload = buildItineraryVehiclePayload(itinerary, { budget: "20000", passengers: "2" });
  assert.equal(Object.hasOwn(payload, "preferredCategory"), false);
});

test("rejects invalid vehicle inputs without changing the itinerary", () => {
  assert.throws(() => buildItineraryVehiclePayload(itinerary, { budget: "0", passengers: "2" }), /budget/i);
  assert.throws(() => buildItineraryVehiclePayload(itinerary, { budget: "20000", passengers: "1.5" }), /passenger/i);
  assert.equal(itinerary.optimized_stops[0].sequence, undefined);
});
