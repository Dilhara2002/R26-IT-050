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
const { buildItineraryVehiclePayload, buildItinerarySafetySummary } = helperModule.exports;

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


test("preserves round-trip planning options without appending a synthetic stop", () => {
  const form = { budget: "20000", passengers: "2" };
  const payload = buildItineraryVehiclePayload({ ...itinerary, planning_options: { return_to_start: true } }, form);
  assert.equal(payload.return_to_start, true);
  assert.equal(payload.optimized_stops.length, 2);
  assert.equal(buildItineraryVehiclePayload({ ...itinerary, travel_estimation: { includes_return_to_start: true } }, form).return_to_start, true);
  assert.equal(buildItineraryVehiclePayload({ ...itinerary, planning_options: { return_to_start: false }, travel_estimation: { includes_return_to_start: true } }, form).return_to_start, false);
  assert.equal(buildItineraryVehiclePayload(itinerary, form).return_to_start, false);
  assert.throws(() => buildItineraryVehiclePayload({ ...itinerary, planning_options: { return_to_start: "true" } }, form), /return-to-start/);
});

test("vehicle API preserves structured failed-leg evidence from a 503 response", async () => {
  const apiCode = babel.transformFileSync(path.resolve(__dirname, "../src/api/safetyApi.js"), {
    presets: ["babel-preset-expo"], babelrc: false, configFile: false,
  }).code;
  const failedJourney = { success: false, incomplete_legs: [{ leg_sequence: 1 }],
    per_leg_safety_results: [{ leg_sequence: 1, status: "failed" }],
    vehicle_recommendation: { status: "unavailable", bestVehicle: null } };
  const apiModule = { exports: {} };
  new Function("module", "exports", "require", apiCode)(apiModule, apiModule.exports, name => {
    if (name === "axios") return { post: async () => { throw { response: { status: 503, data: failedJourney } }; } };
    if (name === "./apiBase") return { API_BASE_URL: "http://test.invalid/api" };
    return require(name);
  });
  assert.deepEqual(await apiModule.exports.getItinerarySafetyRecommendation({}), failedJourney);
});

const safetyLeg = (riskLevel = "High") => ({ status: "success", risk_evidence_available: true,
  risk_prediction: { riskLevel }, distance_km: 10, max_gradient: 0 });
const safetyResult = legs => ({ per_leg_safety_results: legs, partial: false,
  whole_trip_risk_summary: { total_legs: legs.length, complete: true, risk_level: legs[0]?.risk_prediction?.riskLevel } });

test("complete summaries preserve High, Medium and Low classifications and observed zero gradient", () => {
  for (const level of ["High", "Medium", "Low"]) {
    const summary = buildItinerarySafetySummary(safetyResult([safetyLeg(level)]));
    assert.equal(summary.complete, true);
    assert.equal(summary.title, "Whole-trip safety summary");
    assert.equal(summary.riskValue, level);
    assert.equal(summary.safetyCoverage, "1/1");
  }
});

test("four retrieved routes with three evidenced legs show partial risk and 3/4 coverage", () => {
  const result = safetyResult([safetyLeg(), { status: "success", distance_km: 1,
    risk_evidence_available: false, risk_prediction: null, max_gradient: null }, safetyLeg(), safetyLeg()]);
  result.partial = true;
  result.whole_trip_risk_summary.complete = false;
  const before = JSON.stringify(result);
  const summary = buildItinerarySafetySummary(result);
  assert.equal(summary.title, "Partial safety summary");
  assert.equal(summary.riskLabel, "Highest observed risk (evaluated legs only)");
  assert.equal(summary.riskValue, "High");
  assert.equal(summary.routeCoverage, "4/4");
  assert.equal(summary.riskCoverage, "3/4");
  assert.equal(summary.safetyCoverage, "3/4");
  assert.equal(summary.complete, false);
  assert.equal(JSON.stringify(result), before);
});

test("missing gradients remain incomplete even when every leg has risk evidence", () => {
  for (const gradient of [null, undefined, "", "0"]) {
    const summary = buildItinerarySafetySummary(safetyResult([{ ...safetyLeg(), max_gradient: gradient }]));
    assert.equal(summary.complete, false);
    assert.equal(summary.riskCoverage, "1/1");
    assert.equal(summary.safetyCoverage, "0/1");
  }
});

test("failed or absent evidence never becomes Low or a definitive whole-trip risk", () => {
  for (const legs of [[], [{ ...safetyLeg("Low"), status: "failed" }],
    [{ ...safetyLeg("Low"), risk_evidence_available: false }]]) {
    const summary = buildItinerarySafetySummary(safetyResult(legs));
    assert.equal(summary.complete, false);
    assert.equal(summary.riskValue, "Unavailable");
  }
  const result = safetyResult([safetyLeg()]);
  result.whole_trip_risk_summary.total_legs = 2;
  assert.equal(buildItinerarySafetySummary(result).complete, false);
});
