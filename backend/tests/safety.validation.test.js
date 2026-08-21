const test = require("node:test");
const assert = require("node:assert/strict");
const { afterEach } = require("node:test");
const request = require("supertest");

const app = require("../src/app");
const safetyRouter = require(
  "../src/routes/safetyRoutes"
);

const {
  calculateVehicleSuitability,
  setDependenciesForTesting,
  resetDependenciesForTesting,
} = safetyRouter.__test;

const standardSafetyRequest = {
  startLocation: "Colombo",
  endLocation: "Kandy",
  budget: 15000,
  passengers: 4,
};

const standardRouteDetails = {
  distanceKm: 100,
  durationMinutes: 180,
  correctedStartLocation: "Colombo",
  correctedEndLocation: "Kandy",
  startCoordinates: {
    latitude: 6.9271,
    longitude: 79.8612,
  },
};

const standardRoadInfo = {
  "Route/Segment Name": "A1 Colombo-Kandy",
  "Max Gradient (%)": "12",
  "Terrain Type": "Hilly",
  "Road Surface Condition": "Good",
  "Average Elevation": "250",
  "Surface Friction Index": "0.8",
  "Typical Road Width": "7",
  _aggregationType: "route-family",
  _segmentCount: 4,
  _matchedRouteFamily: "A1 Colombo-Kandy",
};

const availableWeather = {
  status: "available",
  isRaining: false,
  temperature: 28,
  weatherMain: "Clear",
  weatherDescription: "clear sky",
  locationName: "Colombo",
};

const availableGraphManager = {
  getMLRiskContext: async () => ({
    status: "available",
    historicalOccurrenceCount: 2,
    hazardType: "Landslide",
    season: "Maha",
  }),
  getSafetyReasoning: async () => ({
    status: "available",
    explanation: "Historical safety evidence is available.",
    risks: [],
    records: [],
  }),
};

const successfulPrediction = async () => ({
  success: true,
  riskLevel: "Medium",
  confidence: 0.82,
  confidencePercent: 82,
  probabilities: {
    Low: 0.1,
    Medium: 0.82,
    High: 0.08,
  },
  modelName: "Gradient Boosting",
  confidenceType: "predicted_class_probability",
  confidenceInterpretation:
    "Probability assigned by this classifier to the predicted class; it is not a calibrated real-world accident or disaster probability.",
  inputFeatures: {
    gradient: 12,
    elevation: 250,
    friction: 0.8,
    historical_occurrence_count: 2,
    road_data_available: 1,
    terrain: "Hilly",
    road_surface: "Good",
    road_width: "7",
    hazard_type: "Landslide",
    season: "Maha",
  },
});

const mlUnavailable = (message) => {
  const error = new Error(message);
  error.code = "ML_UNAVAILABLE";
  return error;
};

const routeFailure = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

const configureWorkingDependencies = (
  overrides = {}
) => {
  setDependenciesForTesting({
    getRouteDetails: async () => standardRouteDetails,
    getWeatherByCoordinates: async () => availableWeather,
    getRoadData: async () => standardRoadInfo,
    graphManager: availableGraphManager,
    runRiskPrediction: successfulPrediction,
    ...overrides,
  });
};

const requestSafetyAnalysis = (body) =>
  request(app)
    .post("/api/safety/recommend-vehicle")
    .send(body);

const assertControlledFailure = (
  response,
  status,
  code
) => {
  assert.equal(response.status, status);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, true);
  assert.equal(response.body.code, code);
  assert.equal(typeof response.body.message, "string");
  assert.ok(response.body.message.length > 0);
};

afterEach(() => {
  resetDependenciesForTesting();
});

test("GET / returns the health response contract", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, "Healthy");
});

test("safety API rejects missing and blank required fields", async () => {
  const missingResponse = await requestSafetyAnalysis({
    startLocation: "Colombo",
  });

  assert.equal(missingResponse.status, 400);
  assert.equal(missingResponse.body.success, false);
  assert.ok(missingResponse.body.message);

  const blankLocationResponse = await requestSafetyAnalysis({
    ...standardSafetyRequest,
    startLocation: "   ",
  });

  assert.equal(blankLocationResponse.status, 400);
  assert.equal(blankLocationResponse.body.success, false);
});

test("safety API rejects non-positive and non-numeric budgets", async () => {
  for (const budget of ["invalid", 0, -100]) {
    const response = await requestSafetyAnalysis({
      ...standardSafetyRequest,
      budget,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(
      response.body.message,
      /budget must be a positive number/i
    );
  }
});

test("safety API rejects invalid passenger counts", async () => {
  for (const passengers of ["invalid", 0, -1, 1.5]) {
    const response = await requestSafetyAnalysis({
      ...standardSafetyRequest,
      passengers,
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.success, false);
    assert.match(
      response.body.message,
      /passengers must be a positive number/i
    );
  }
});

test("safety API reports an unresolvable user location", async () => {
  configureWorkingDependencies({
    getRouteDetails: async () => {
      throw routeFailure("LOCATION_NOT_FOUND");
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 422, "LOCATION_UNRESOLVABLE");
});

test("safety API reports a geocoding outage or timeout", async () => {
  configureWorkingDependencies({
    getRouteDetails: async () => {
      throw routeFailure("GEOCODING_UNAVAILABLE");
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 503, "LOCATION_SERVICE_UNAVAILABLE");
});

test("safety API returns 503 when Python ML is unavailable", async () => {
  configureWorkingDependencies({
    runRiskPrediction: async () => {
      throw mlUnavailable(
        "Could not start Python ML process: unavailable"
      );
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 503, "ML_UNAVAILABLE");
});

test("safety API returns 503 for malformed Python ML output", async () => {
  configureWorkingDependencies({
    runRiskPrediction: async () => {
      throw mlUnavailable(
        "Failed to parse ML output: invalid JSON"
      );
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 503, "ML_UNAVAILABLE");
});

test("safety API returns 503 for failed Python ML prediction", async () => {
  configureWorkingDependencies({
    runRiskPrediction: async () => {
      throw mlUnavailable(
        "ML prediction returned an error."
      );
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 503, "ML_UNAVAILABLE");
});

test("safety API returns 503 for Python ML timeout", async () => {
  configureWorkingDependencies({
    runRiskPrediction: async () => {
      throw mlUnavailable(
        "ML prediction timed out after 1ms."
      );
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 503, "ML_UNAVAILABLE");
});

test("Neo4j failure degrades gracefully while ML succeeds", async () => {
  configureWorkingDependencies({
    graphManager: {
      getMLRiskContext: async () => {
        throw new Error("Neo4j unavailable");
      },
      getSafetyReasoning: async () => {
        throw new Error("Neo4j unavailable");
      },
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.graphRAG.status, "unavailable");
  assert.ok(response.body.riskPrediction);
  assert.equal(
    response.body.explanation.contextualEvidence.neo4j.status,
    "unavailable"
  );
  assert.equal(
    response.body.explanation.contextualEvidence.neo4j
      .retrievalContextAvailable,
    false
  );
});

test("known valid path returns a deterministic safety response contract", async () => {
  configureWorkingDependencies();

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.trip.from, "Colombo");
  assert.equal(response.body.trip.to, "Kandy");
  assert.equal(response.body.riskPrediction.modelName, "Gradient Boosting");
  assert.equal(response.body.analysis.matchedRoad, "A1 Colombo-Kandy");
  assert.equal(response.body.analysis.roadAggregation, "route-family");
  assert.equal(response.body.analysis.aggregatedSegmentCount, 4);
  assert.equal(response.body.analysis.weather, "clear sky");
  assert.equal(response.body.analysis.rainDetected, false);
  assert.equal(typeof response.body.totalVehiclesAnalyzed, "number");
  assert.equal(
    response.body.riskPrediction.confidenceType,
    "predicted_class_probability"
  );
  assert.match(
    response.body.riskPrediction.confidenceInterpretation,
    /not a calibrated real-world accident/i
  );
  assert.equal(
    response.body.explanation.risk.modelInputs.gradient,
    12
  );
  assert.equal(
    response.body.explanation.contextualEvidence.weather
      .usedAsModelInput,
    false
  );
  assert.equal(
    response.body.explanation.contextualEvidence.neo4j
      .graphValuesCanPopulateModelInputs,
    true
  );
  assert.ok(
    response.body.explanation.vehicleRecommendation.reason
  );
  assert.equal(
    response.body.explanation.vehicleRecommendation.status,
    "selected"
  );
  assert.equal(
    response.body.explanation.vehicleRecommendation.filters
      .gradientSuitability,
    "suitable"
  );

});

test("vehicle category filtering remains active in the explanation path", async () => {
  configureWorkingDependencies();

  const response = await requestSafetyAnalysis({
    ...standardSafetyRequest,
    budget: 50000,
    preferredCategory: "SUV",
  });

  assert.equal(response.status, 200);

  for (const vehicle of [
    response.body.bestVehicle,
    ...response.body.alternativeOptions,
    response.body.safetyUpsell,
  ].filter(Boolean)) {
    assert.ok(
      String(vehicle.vehicleCategory)
        .toLowerCase()
        .includes("suv")
    );
  }
});

test("weather failure remains enrichment-only", async () => {
  configureWorkingDependencies({
    getWeatherByCoordinates: async () => {
      throw new Error("Weather timeout");
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.analysis.weather, null);
  assert.equal(response.body.analysis.temperature, null);
  assert.equal(response.body.analysis.rainDetected, null);
  assert.ok(response.body.riskPrediction);
  assert.equal(
    response.body.explanation.contextualEvidence.weather.status,
    "unavailable"
  );
  assert.equal(
    response.body.explanation.contextualEvidence.weather
      .usedAsModelInput,
    false
  );
});

test("unknown gradient remains explicit and prevents an upsell explanation", async () => {
  configureWorkingDependencies({
    getRoadData: async () => ({
      ...standardRoadInfo,
      "Max Gradient (%)": null,
      "Average Elevation": null,
      "Surface Friction Index": null,
    }),
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.analysis.gradient, null);
  assert.equal(
    response.body.explanation.vehicleRecommendation.filters
      .gradientSuitability,
    "unknown"
  );
  assert.equal(response.body.safetyUpsell, null);
  assert.equal(
    response.body.explanation.safetyUpsell.status,
    "not_available"
  );
  assert.match(
    response.body.explanation.safetyUpsell.reason,
    /gradient data is unavailable/i
  );
});

test("known gradient can explain a stronger road-capability upsell", async () => {
  configureWorkingDependencies();

  const response = await requestSafetyAnalysis({
    ...standardSafetyRequest,
    budget: 11000,
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.safetyUpsell);
  assert.equal(
    response.body.explanation.safetyUpsell.status,
    "available"
  );
  assert.equal(
    response.body.explanation.safetyUpsell.routeGradient,
    12
  );
  assert.ok(
    response.body.explanation.safetyUpsell.reason
  );
});

test("safety API reports an unsupported road dataset route", async () => {
  configureWorkingDependencies({
    getRoadData: async () => null,
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.match(
    response.body.message,
    /no supported road dataset match/i
  );
});

test("safety API reports incomplete matched road data", async () => {
  configureWorkingDependencies({
    getRoadData: async () => ({
      "Route/Segment Name": "Incomplete Road",
    }),
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assertControlledFailure(response, 422, "ROAD_DATA_INCOMPLETE");
});

test("vehicle gradient suitability is calculated when data is available", () => {
  const result = calculateVehicleSuitability(
    {
      "Gradeability (%)": "20",
    },
    12
  );

  assert.equal(result.gradientDataAvailable, true);
  assert.equal(result.roadGradient, 12);
  assert.equal(result.gradeabilityMargin, 8);
  assert.equal(result.suitableForGradient, true);
  assert.equal(result.gradientSuitability, "suitable");
});

test("vehicle gradient suitability remains unknown without gradient data", () => {
  const result = calculateVehicleSuitability(
    {
      "Gradeability (%)": "20",
    },
    null
  );

  assert.equal(result.gradientDataAvailable, false);
  assert.equal(result.roadGradient, null);
  assert.equal(result.gradeabilityMargin, null);
  assert.equal(result.suitableForGradient, null);
  assert.equal(result.gradientSuitability, "unknown");
});
