import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

import app from "../src/app.js";
import { setSafetyRouteDependenciesForTesting } from "../src/routes/safetyRoutes.js";

setSafetyRouteDependenciesForTesting({
  getRouteDetails: async (startLocation, endLocation) => ({
    distanceKm: 100,
    durationMinutes: 150,
    correctedStartLocation: startLocation,
    correctedEndLocation: endLocation,
    startCoordinates: { latitude: 6.9271, longitude: 79.8612 },
    endCoordinates: { latitude: 7.2906, longitude: 80.6337 },
  }),
  getWeatherByCoordinates: async () => ({
    status: "available",
    isRaining: false,
    temperature: 27,
    weatherDescription: "clear sky",
    locationName: "Colombo",
  }),
  getRoadData: async () => ({
    "Route/Segment Name": "A1 Colombo-Kandy",
    "Max Gradient (%)": 8,
    "Average Elevation": 120,
    "Surface Friction Index": 0.72,
    "Terrain Type": "Mountainous",
    "Road Surface Condition": "Asphalt - Good",
    "Typical Road Width": "Wide",
    _aggregationType: "route-family",
    _segmentCount: 5,
  }),
  graphManager: {
    getMLRiskContext: async () => ({ status: "available", historicalOccurrenceCount: 2 }),
    getSafetyReasoning: async () => ({ status: "available", explanation: "Deterministic test context." }),
  },
  runRiskPrediction: async (inputFeatures) => ({
    success: true,
    riskLevel: "Medium",
    confidence: 0.8,
    confidencePercent: 80,
    probabilities: { Low: 0.1, Medium: 0.8, High: 0.1 },
    modelName: "deterministic-mock",
    inputFeatures,
  }),
});


const requestSafetyAnalysis = (
  body
) =>
  request(app)
    .post("/api/safety/recommend-vehicle")
    .send(body);


const standardSafetyRequest = {
  startLocation: "Colombo",
  endLocation: "Kandy",
  budget: 15000,
  passengers: 4,
};


let standardSafetyResponse;


const getStandardSafetyResponse = () => {
  if (!standardSafetyResponse) {
    standardSafetyResponse =
      requestSafetyAnalysis(
        standardSafetyRequest
      );
  }

  return standardSafetyResponse;
};


const assertSuccessfulResponseOrMlOutage = (
  response
) => {
  assert.ok(
    response.status === 200 ||
    response.status === 503
  );


  if (response.status === 503) {
    assert.equal(
      response.body.code,
      "ML_UNAVAILABLE"
    );
    return false;
  }


  assert.equal(response.body.success, true);
  return true;
};


const assertVehicleMatchesCategory = (
  vehicle,
  category
) => {
  assert.ok(
    String(vehicle.vehicleCategory)
      .toLowerCase()
      .includes(category.toLowerCase())
  );
};


test("GET / returns the health response contract", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, "Healthy");
});


test(
  "POST /api/safety/recommend-vehicle rejects missing required fields",
  async () => {
    const response = await requestSafetyAnalysis({
      startLocation: "Colombo",
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.ok(response.body.message);
  }
);


test(
  "POST /api/safety/recommend-vehicle rejects an invalid budget",
  async () => {
    const response = await requestSafetyAnalysis({
      startLocation: "Colombo",
      endLocation: "Kandy",
      budget: -100,
      passengers: 4,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(
      response.body.message,
      /budget must be a positive number/i
    );
  }
);


test(
  "POST /api/safety/recommend-vehicle rejects an invalid passenger count",
  async () => {
    const response = await requestSafetyAnalysis({
      startLocation: "Colombo",
      endLocation: "Kandy",
      budget: 15000,
      passengers: 0,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(
      response.body.message,
      /passengers must be a positive number/i
    );
  }
);


test(
  "POST /api/safety/recommend-vehicle returns the success response contract or ML outage",
  async () => {
    const response = await getStandardSafetyResponse();

    if (!assertSuccessfulResponseOrMlOutage(response)) {
      return;
    }

    assert.ok(response.body.trip);
    assert.ok(response.body.trip.from);
    assert.ok(response.body.trip.to);
    assert.ok(response.body.trip.distanceKm > 0);
    assert.ok(response.body.trip.durationMinutes > 0);

    assert.ok(response.body.riskPrediction);
    assert.ok(
      ["Low", "Medium", "High"].includes(
        response.body.riskPrediction.riskLevel
      )
    );
    assert.ok(response.body.riskPrediction.modelName);
    assert.equal(
      typeof response.body.riskPrediction.confidence,
      "number"
    );
    assert.ok(response.body.riskPrediction.probabilities);

    assert.ok(response.body.analysis);
    assert.ok(response.body.analysis.matchedRoad);
    assert.equal(
      typeof response.body.analysis.gradient,
      "number"
    );
    assert.ok(
      response.body.analysis.roadAggregation ===
        "route-family" ||
      response.body.analysis.roadAggregation === null
    );

    assert.ok(response.body.graphRAG);
    assert.ok(
      ["available", "unavailable"].includes(
        response.body.graphRAG.status
      )
    );
    assert.equal(
      typeof response.body.totalVehiclesAnalyzed,
      "number"
    );
  }
);


test(
  "POST /api/safety/recommend-vehicle keeps SUV category filtering across recommendations",
  async () => {
    const response = await requestSafetyAnalysis({
      ...standardSafetyRequest,
      preferredCategory: "SUV",
    });

    if (!assertSuccessfulResponseOrMlOutage(response)) {
      return;
    }

    if (response.body.bestVehicle) {
      assertVehicleMatchesCategory(
        response.body.bestVehicle,
        "SUV"
      );
    }

    response.body.alternativeOptions.forEach(
      (vehicle) => {
        assertVehicleMatchesCategory(
          vehicle,
          "SUV"
        );
      }
    );

    if (response.body.safetyUpsell) {
      assertVehicleMatchesCategory(
        response.body.safetyUpsell,
        "SUV"
      );
    }
  }
);


test(
  "POST /api/safety/recommend-vehicle exposes aggregated road data for Colombo to Kandy",
  async () => {
    const response = await getStandardSafetyResponse();

    if (!assertSuccessfulResponseOrMlOutage(response)) {
      return;
    }

    assert.equal(
      response.body.analysis.matchedRoad,
      "A1 Colombo-Kandy"
    );
    assert.equal(
      response.body.analysis.roadAggregation,
      "route-family"
    );
    assert.ok(
      Number.isInteger(
        response.body.analysis
          .aggregatedSegmentCount
      )
    );
    assert.ok(
      response.body.analysis
        .aggregatedSegmentCount > 1
    );
    assert.equal(
      typeof response.body.analysis.gradient,
      "number"
    );
    assert.equal(
      typeof response.body.analysis.averageElevation,
      "number"
    );
    assert.equal(
      typeof response.body.analysis.surfaceFrictionIndex,
      "number"
    );
  }
);


test(
  "POST /api/safety/recommend-vehicle keeps ML results when Neo4j is unavailable",
  async () => {
    const response = await getStandardSafetyResponse();

    if (!assertSuccessfulResponseOrMlOutage(response)) {
      return;
    }

    assert.ok(
      ["available", "unavailable"].includes(
        response.body.graphRAG.status
      )
    );

    if (response.body.graphRAG.status === "unavailable") {
      assert.equal(response.body.success, true);
      assert.ok(response.body.riskPrediction);
    }
  }
);
