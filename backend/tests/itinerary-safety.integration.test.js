import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import axios from "axios";

import itinerarySafetyRoutes from "../src/routes/itinerarySafety.routes.js";
import {
  resetSafetyAnalysisDependenciesForTesting,
  setSafetyAnalysisDependenciesForTesting,
} from "../src/services/safetyAnalysis.service.js";
import { getRouteAlternativesByCoordinates } from "../src/services/routeService.js";

const api = express();
api.use(express.json());
api.use("/api/safety", itinerarySafetyRoutes);

const startingLocation = { lat: 7.29, lon: 80.63, name: "Start" };
const makeStops = (names) => names.map((name, index) => ({
  sequence: index + 1,
  place_id: index % 2 ? index + 1 : String(index + 1),
  name,
  latitude: 7.3 + index / 100,
  longitude: 80.64 + index / 100,
  duration_minutes: 60,
}));
const makeBody = (names = ["A"], extra = {}) => ({
  starting_location: startingLocation,
  optimized_stops: makeStops(names),
  ...extra,
});
const post = (body) => request(api).post("/api/safety/recommend-itinerary").send(body);

let scenario;
let active;
let maximumActive;
let vehicleCalls;
let vehicleContexts;

const installMocks = (overrides = {}) => {
  scenario = {
    failures: new Set(),
    noRisk: new Set(),
    risks: {},
    gradients: {},
    weatherFails: false,
    graphFails: false,
    ...overrides,
  };
  active = 0;
  maximumActive = 0;
  vehicleCalls = 0;
  vehicleContexts = [];
  setSafetyAnalysisDependenciesForTesting({
    getRouteAlternativesByCoordinates: async (from, to) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        await new Promise((resolve) => setTimeout(resolve, to.name === "B" ? 12 : 4));
        if (scenario.failures.has(to.name)) {
          const error = new Error("secret upstream detail");
          error.code = "ROUTE_SERVICE_ERROR";
          throw error;
        }
        return [{
          routeId: `route-${to.name}`,
          isFastestRoute: true,
          distanceKm: 10 + to.name.charCodeAt(0) - 65,
          durationMinutes: 20,
          geometry: scenario.invalidGeometry?.has(to.name)
            ? { type: "LineString", coordinates: [[from.lat, from.lon], [to.lat, to.lon]] }
            : { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
          roadNames: [to.name],
        }];
      } finally {
        active -= 1;
      }
    },
    getRoadDataByRouteLabels: async ([name]) => scenario.noRisk.has(name) ? null : ({
      "Route/Segment Name": `Road ${name}`,
      "Max Gradient (%)": scenario.gradients[name] ?? 3,
      _matchedRouteFamily: `Road ${name}`,
    }),
    getRoadDataByNames: async (_from, name) => scenario.noRisk.has(name) ? null : ({
      "Route/Segment Name": `Road ${name}`,
      "Max Gradient (%)": scenario.gradients[name] ?? 3,
      _matchedRouteFamily: `Road ${name}`,
    }),
    runRiskPrediction: async (input) => {
      const name = Object.keys(scenario.gradients)
        .find((key) => scenario.gradients[key] === input.gradient);
      const riskLevel = scenario.risks[name] || (input.gradient >= 7 ? "High" : input.gradient >= 4 ? "Medium" : "Low");
      return { riskLevel, confidence: 0.8, probabilities: { [riskLevel]: 0.8 }, modelName: "mock-model" };
    },
    getWeatherByCoordinates: async () => {
      if (scenario.weatherFails) throw new Error("weather unavailable");
      return { status: "available", weatherDescription: "clear" };
    },
    graphManager: {
      getMLRiskContext: async () => {
        if (scenario.graphFails) throw new Error("graph unavailable");
        return { status: "available" };
      },
      getSafetyReasoning: async () => {
        if (scenario.graphFails) throw new Error("graph unavailable");
        return { status: "available", explanation: "mock" };
      },
    },
    recommendVehicle: async (context) => {
      vehicleCalls += 1;
      vehicleContexts.push(context);
      if (![context.distanceKm, context.maxGradient].every(Number.isFinite) || !context.riskLevel) {
        return { status: "unavailable", reason: "Required whole-trip evidence is unavailable." };
      }
      return { status: "available", calculationScope: "whole-trip-once", ...context };
    },
  });
};

test("itinerary safety integration", async (t) => {
  await t.test("existing safety endpoints remain mounted", async () => {
    process.env.NODE_ENV = "test";
    const { default: app } = await import("../src/app.js");
    const vehicle = await request(app).post("/api/safety/recommend-vehicle").send({});
    const route = await request(app).post("/api/safety/recommend-route").send({});
    assert.equal(vehicle.status, 400);
    assert.equal(route.status, 400);
  });

  await t.test("existing itinerary endpoint remains mounted", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app).post("/api/itinerary/optimize").send({});
    assert.equal(response.status, 400);
  });

  await t.test("valid start plus one stop constructs one leg", async () => {
    installMocks();
    const response = await post(makeBody(["A"]));
    assert.equal(response.status, 200);
    assert.equal(response.body.per_leg_safety_results.length, 1);
    assert.equal(response.body.per_leg_safety_results[0].from.name, "Start");
    assert.equal(response.body.per_leg_safety_results[0].to.name, "A");
  });

  await t.test("multiple stops construct ordered adjacent legs", async () => {
    installMocks();
    const response = await post(makeBody(["A", "B", "C"]));
    assert.deepEqual(response.body.per_leg_safety_results.map((leg) => [leg.from.name, leg.to.name]),
      [["Start", "A"], ["A", "B"], ["B", "C"]]);
  });

  await t.test("coordinates bypass geocoding", async () => {
    const originalGet = axios.get;
    let captured;
    axios.get = async (url, options) => {
      captured = { url, options };
      return {
        data: {
          routes: [{
            distance: 1000,
            duration: 60,
            geometry: { type: "LineString", coordinates: [[80.63, 7.29], [80.64, 7.3]] },
            legs: [{ steps: [] }],
          }],
        },
      };
    };
    try {
      const routes = await getRouteAlternativesByCoordinates(startingLocation, {
        lat: 7.3, lon: 80.64, name: "A",
      });
      assert.equal(routes[0].startLocationSource, "request-coordinates");
      assert.match(captured.url, /80\.63,7\.29;80\.64,7\.3$/);
      assert.deepEqual(captured.options.params, {
        overview: "full",
        alternatives: "true",
        steps: "true",
        geometries: "geojson",
      });
    } finally {
      axios.get = originalGet;
    }
  });

  await t.test("maximum eight stops accepted and nine rejected", async () => {
    installMocks();
    assert.equal((await post(makeBody(["A", "B", "C", "D", "E", "F", "G", "H"]))).status, 200);
    assert.equal((await post(makeBody(["A", "B", "C", "D", "E", "F", "G", "H", "I"]))).status, 400);
  });

  await t.test("coordinate range and type validation", async () => {
    installMocks();
    assert.equal((await post({ ...makeBody(), starting_location: { ...startingLocation, lat: "7.2" } })).status, 400);
    assert.equal((await post({ ...makeBody(), starting_location: { ...startingLocation, lon: 181 } })).status, 400);
    const body = makeBody(); body.optimized_stops[0].latitude = -91;
    assert.equal((await post(body)).status, 400);
  });

  await t.test("place_id strings and numbers normalize to strings", async () => {
    installMocks();
    const response = await post(makeBody(["A", "B"]));
    assert.deepEqual(response.body.original_optimized_stop_order.map((stop) => stop.place_id), ["1", "2"]);
  });

  await t.test("duplicate place ids are rejected", async () => {
    installMocks(); const body = makeBody(["A", "B"]); body.optimized_stops[1].place_id = "1";
    assert.equal((await post(body)).status, 400);
  });

  await t.test("duplicate coordinates including the start are rejected", async () => {
    installMocks(); const body = makeBody();
    body.optimized_stops[0].latitude = startingLocation.lat;
    body.optimized_stops[0].longitude = startingLocation.lon;
    assert.match((await post(body)).body.message, /duplicate itinerary coordinates/i);
  });

  await t.test("budget and passengers must be a pair", async () => {
    installMocks();
    assert.equal((await post(makeBody(["A"], { budget: 1000 }))).status, 400);
    assert.equal((await post(makeBody(["A"], { passengers: 2 }))).status, 400);
  });

  await t.test("budget and passengers validate strictly", async () => {
    installMocks();
    assert.equal((await post(makeBody(["A"], { budget: -1, passengers: 2 }))).status, 400);
    assert.equal((await post(makeBody(["A"], { budget: 1000, passengers: 1.5 }))).status, 400);
  });

  await t.test("all-success aggregation is complete", async () => {
    installMocks({ gradients: { A: 2, B: 3 } });
    const body = (await post(makeBody(["A", "B"]))).body;
    assert.equal(body.partial, false);
    assert.equal(body.tripRiskComplete, true);
    assert.equal(body.whole_trip_risk_summary.complete, true);
  });

  await t.test("worst valid leg risk wins", async () => {
    installMocks({ gradients: { A: 2, B: 5, C: 8 } });
    const body = (await post(makeBody(["A", "B", "C"]))).body;
    assert.equal(body.whole_trip_risk_summary.risk_level, "High");
    assert.equal(body.whole_trip_risk_summary.aggregation_method, "maximum_successful_leg_risk");
  });

  await t.test("single-leg alternative selection deterministically prefers lower risk", async () => {
    installMocks({ gradients: { HighRoad: 8, LowRoad: 2 } });
    setSafetyAnalysisDependenciesForTesting({
      getRouteAlternativesByCoordinates: async (from, to) => [
        {
          routeId: "fast-high",
          isFastestRoute: true,
          distanceKm: 9,
          durationMinutes: 15,
          geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
          roadNames: ["HighRoad"],
        },
        {
          routeId: "slower-low",
          isFastestRoute: false,
          distanceKm: 10,
          durationMinutes: 17,
          geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
          roadNames: ["LowRoad"],
        },
      ],
    });
    const leg = (await post(makeBody(["A"]))).body.per_leg_safety_results[0];
    assert.equal(leg.selected_route_mode, "lower-risk-recommended");
    assert.equal(leg.risk_prediction.riskLevel, "Low");
    assert.equal(leg.distance_km, 10);
  });

  await t.test("middle-leg failure retains later successful legs in order", async () => {
    installMocks({ failures: new Set(["B"]) });
    const body = (await post(makeBody(["A", "B", "C"]))).body;
    assert.deepEqual(body.per_leg_safety_results.map((leg) => leg.status), ["success", "failed", "success"]);
  });

  await t.test("partial and partial_failures are truthful and sanitized", async () => {
    installMocks({ failures: new Set(["B"]) });
    const body = (await post(makeBody(["A", "B", "C"]))).body;
    assert.equal(body.partial, true);
    assert.equal(body.partial_failures.length, 1);
    assert.doesNotMatch(JSON.stringify(body), /secret upstream detail/);
  });

  await t.test("a failed leg makes tripRiskComplete false", async () => {
    installMocks({ failures: new Set(["B"]) });
    assert.equal((await post(makeBody(["A", "B"]))).body.tripRiskComplete, false);
  });

  await t.test("a successful route without risk evidence is incomplete", async () => {
    installMocks({ noRisk: new Set(["B"]) });
    const body = (await post(makeBody(["A", "B"]))).body;
    assert.equal(body.per_leg_safety_results[1].status, "success");
    assert.equal(body.tripRiskComplete, false);
  });

  await t.test("no evaluable risk produces a null aggregate", async () => {
    installMocks({ noRisk: new Set(["A", "B"]) });
    const body = (await post(makeBody(["A", "B"]))).body;
    assert.equal(body.whole_trip_risk_summary.risk_level, null);
    assert.equal(body.whole_trip_risk_summary.evaluable_risk_legs, 0);
  });

  await t.test("all core failures produce a controlled non-2xx response", async () => {
    installMocks({ failures: new Set(["A", "B"]) });
    const response = await post(makeBody(["A", "B"]));
    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
  });

  await t.test("vehicle recommendation runs once for the whole trip", async () => {
    installMocks({ gradients: { A: 2, B: 5 } });
    await post(makeBody(["A", "B"], { budget: 15000, passengers: 4 }));
    assert.equal(vehicleCalls, 1);
  });

  await t.test("vehicle input uses total successful distance and maximum known gradient", async () => {
    installMocks({ gradients: { A: 2, B: 5 } });
    await post(makeBody(["A", "B"], { budget: 15000, passengers: 4 }));
    assert.equal(vehicleContexts[0].distanceKm, 21);
    assert.equal(vehicleContexts[0].maxGradient, 5);
  });

  await t.test("GeoJSON keeps longitude latitude order and rejects invalid geometry", async () => {
    installMocks({ invalidGeometry: new Set(["B"]) });
    const body = (await post(makeBody(["A", "B"]))).body;
    assert.deepEqual(body.per_leg_safety_results[0].route_geometry.coordinates[0], [80.63, 7.29]);
    assert.equal(body.per_leg_safety_results[1].route_geometry, null);
  });

  await t.test("active leg analysis never exceeds two", async () => {
    installMocks();
    await post(makeBody(["A", "B", "C", "D", "E", "F", "G", "H"]));
    assert.equal(maximumActive, 2);
  });

  await t.test("original optimized stop order is preserved", async () => {
    installMocks();
    const body = (await post(makeBody(["C", "A", "B"]))).body;
    assert.deepEqual(body.original_optimized_stop_order.map((stop) => stop.name), ["C", "A", "B"]);
  });

  await t.test("Neo4j and weather failures do not erase core results", async () => {
    installMocks({ graphFails: true, weatherFails: true });
    const body = (await post(makeBody(["A"]))).body;
    assert.equal(body.per_leg_safety_results[0].status, "success");
    assert.equal(body.per_leg_safety_results[0].weather.status, "unavailable");
  });

  await t.test("client evidence cannot override server analysis", async () => {
    installMocks({ gradients: { A: 8 } });
    const body = await post(makeBody(["A"], {
      risk_prediction: { riskLevel: "Low" },
      graph_context: { status: "forged" },
      route_geometry: { type: "Point", coordinates: [0, 0] },
    }));
    assert.equal(body.body.whole_trip_risk_summary.risk_level, "High");
    assert.notEqual(body.body.per_leg_safety_results[0].graph_context.status, "forged");
  });

  await t.test("an unrelated route remains operational", async () => {
    const { default: app } = await import("../src/app.js");
    const response = await request(app).get("/");
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
  });

  resetSafetyAnalysisDependenciesForTesting();
});
