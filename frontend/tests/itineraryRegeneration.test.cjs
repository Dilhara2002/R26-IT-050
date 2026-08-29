const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const babel = require("@babel/core");


const helperPath = path.resolve(
  __dirname,
  "../services/itineraryRegeneration.js"
);
const transformed = babel.transformFileSync(helperPath, {
  presets: ["babel-preset-expo"],
  babelrc: false,
  configFile: false,
}).code;
const helperModule = { exports: {} };
const loadHelper = new Function("module", "exports", "require", transformed);
loadHelper(helperModule, helperModule.exports, require);
const {
  applyFailedRegeneration,
  applySuccessfulRegeneration,
  buildFullRegenerationRequest,
  buildReplacementRequest,
  createRegenerationContext,
} = helperModule.exports;


const itinerary = {
  starting_location: { lat: 7.2906, lon: 80.6337 },
  user_preferences: ["Nature", "Adventure"],
  max_time_allocated_mins: 360,
  search_radius_km: 15,
  optimized_stops: [
    { place_id: "place-a", name: "Place A" },
    { place_id: "place-b", name: "Place B" },
    { place_id: "place-c", name: "Place C" },
  ],
};


test("replacement request excludes one stop and locks every accepted stop", () => {
  const request = buildReplacementRequest(itinerary, "place-b");
  assert.equal(request.generation_mode, "replace_stop");
  assert.deepEqual(request.excluded_place_ids, ["place-b"]);
  assert.deepEqual(request.locked_place_ids, ["place-a", "place-c"]);
  assert.equal(request.replaced_place_id, "place-b");
  assert.equal(request.target_stop_count, 3);
  assert.equal(request.max_time_minutes, 360);
  assert.equal(request.radius_km, 15);
});

test("full regeneration excludes the complete current place set", () => {
  const request = buildFullRegenerationRequest(
    itinerary,
    createRegenerationContext(itinerary)
  );
  assert.equal(request.generation_mode, "full_regeneration");
  assert.deepEqual(request.excluded_place_ids, ["place-a", "place-b", "place-c"]);
  assert.deepEqual(request.locked_place_ids, []);
  assert.deepEqual(request.preferences, itinerary.user_preferences);
  assert.equal(request.target_stop_count, 3);
  assert.deepEqual(request.current_plan_signature, ["place-a", "place-b", "place-c"]);
  assert.deepEqual(request.recent_plan_signatures, [["place-a", "place-b", "place-c"]]);
});

test("stable full-regeneration target remains three after a degraded displayed response", () => {
  const context = createRegenerationContext(itinerary);
  const degraded = {
    ...itinerary,
    optimized_stops: [{ place_id: "arthurs-seat", name: "Arthur's Seat" }],
  };
  const request = buildFullRegenerationRequest(degraded, context);
  assert.equal(request.target_stop_count, 3);
  assert.deepEqual(request.current_plan_signature, ["arthurs-seat"]);
  assert.deepEqual(request.recent_plan_signatures, [
    ["place-a", "place-b", "place-c"],
    ["arthurs-seat"],
  ]);
});

test("failed regeneration preserves itinerary and existing safety evidence", () => {
  const safetyResult = { status: "safe" };
  const currentState = {
    data: itinerary,
    persistence: { saved: true },
    safetyResult,
    regenerationLoading: { mode: "replace_stop" },
    regenerationError: "",
  };
  const next = applyFailedRegeneration(
    currentState,
    { response: { data: { error: "No verified replacement can fit." } } }
  );
  assert.strictEqual(next.data, itinerary);
  assert.strictEqual(next.safetyResult, safetyResult);
  assert.deepEqual(next.persistence, { saved: true });
  assert.equal(next.regenerationLoading, null);
  assert.equal(next.regenerationError, "No verified replacement can fit.");
});

test("successful regeneration updates route metadata and clears stale safety", () => {
  const newData = {
    ...itinerary,
    generation_mode: "replace_stop",
    route_changed: true,
    optimized_route: ["Place A (20 mins)", "Place D (20 mins)"],
    optimized_stops: [
      { place_id: "place-a", latitude: 7.29, longitude: 80.63, explanation: "Kept." },
      { place_id: "place-d", latitude: 7.30, longitude: 80.64, explanation: "Replacement." },
    ],
    planned_time_minutes: 55,
    route_explanation: { summary: "Updated deterministic explanation." },
  };
  const next = applySuccessfulRegeneration(
    { data: itinerary, safetyResult: { status: "old" }, safetyError: "old" },
    { status: "success", data: newData, persistence: { saved: false, status: "failed" } }
  );
  assert.strictEqual(next.data, newData);
  assert.equal(next.safetyResult, null);
  assert.equal(next.safetyError, "");
  assert.deepEqual(next.persistence, { saved: false, status: "failed" });
  assert.equal(next.data.route_explanation.summary, "Updated deterministic explanation.");
});

test("successful full regeneration preserves target, records history, and clears Safety", () => {
  const context = createRegenerationContext(itinerary);
  const nextData = {
    ...itinerary,
    generation_mode: "full_regeneration",
    route_changed: true,
    optimized_stops: [
      { place_id: "place-a", name: "Place A" },
      { place_id: "place-d", name: "Place D" },
      { place_id: "place-e", name: "Place E" },
    ],
  };
  const next = applySuccessfulRegeneration(
    {
      data: itinerary,
      safetyResult: { status: "old" },
      safetyError: "old",
      regenerationLoading: { mode: "full_regeneration" },
      regenerationContext: context,
    },
    { status: "success", data: nextData }
  );
  assert.equal(next.regenerationContext.targetStopCount, 3);
  assert.deepEqual(next.regenerationContext.recentPlanSignatures, [
    ["place-a", "place-b", "place-c"],
    ["place-a", "place-d", "place-e"],
  ]);
  assert.equal(next.safetyResult, null);
  assert.equal(next.safetyError, "");
});

test("degraded or recent full-regeneration success is rejected before replacing state", () => {
  const context = createRegenerationContext(itinerary);
  const baseState = {
    data: itinerary,
    safetyResult: { status: "kept" },
    regenerationLoading: { mode: "full_regeneration" },
    regenerationContext: context,
  };
  assert.throws(
    () => applySuccessfulRegeneration(baseState, {
      status: "success",
      data: {
        ...itinerary,
        generation_mode: "full_regeneration",
        route_changed: true,
        optimized_stops: [{ place_id: "only-one" }],
      },
    }),
    /stable 3-stop target/
  );
  assert.throws(
    () => applySuccessfulRegeneration(baseState, {
      status: "success",
      data: { ...itinerary, generation_mode: "full_regeneration", route_changed: true },
    }),
    /current plan again|recent plan again/
  );
});

test("controlled exhaustion preserves current plan and Safety state", () => {
  const safetyResult = { status: "complete", legs: 3 };
  const currentState = {
    data: itinerary,
    safetyResult,
    regenerationLoading: { mode: "full_regeneration" },
  };
  const next = applyFailedRegeneration(currentState, {
    response: {
      data: {
        code: "no_additional_feasible_alternative",
        error: "No additional feasible useful itinerary remains in the bounded verified candidate set.",
      },
    },
  });
  assert.strictEqual(next.data, itinerary);
  assert.strictEqual(next.safetyResult, safetyResult);
  assert.match(next.regenerationError, /No additional feasible useful itinerary/);
});

test("unchanged or unusable success payload is rejected", () => {
  assert.throws(
    () => applySuccessfulRegeneration({ data: itinerary }, {
      status: "success",
      data: { route_changed: false, optimized_stops: itinerary.optimized_stops },
    }),
    /unchanged route/
  );
});
