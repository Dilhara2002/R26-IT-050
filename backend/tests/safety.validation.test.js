const test = require("node:test");
const assert = require("node:assert/strict");
const { afterEach } = require("node:test");
const path = require("node:path");
const request = require("supertest");

const app = require("../src/app");
const safetyRouter = require(
  "../src/routes/safetyRoutes"
);

const {
  calculateVehicleSuitability,
  setDependenciesForTesting,
  resetDependenciesForTesting,
  getRoadData,
  loadStaticCsvData,
  resetStaticDataCacheForTesting,
  getStaticDataCacheStateForTesting,
  compareEvaluatedRoutes,
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

const requestRouteRecommendation = (body = {
  startingLocation: "Colombo",
  destination: "Kandy",
}) => request(app)
  .post("/api/safety/recommend-route")
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

test("route comparator ranks risk class, probabilities, duration and distance deterministically", () => {
  const routes = [
    { routeId: "high", predictedRiskLevel: "High", classProbabilities: { High: 0.6 }, durationMinutes: 80, distanceKm: 70 },
    { routeId: "medium-b", predictedRiskLevel: "Medium", classProbabilities: { High: 0.2, Medium: 0.7 }, durationMinutes: 70, distanceKm: 60 },
    { routeId: "medium-a", predictedRiskLevel: "Medium", classProbabilities: { High: 0.1, Medium: 0.8 }, durationMinutes: 90, distanceKm: 80 },
  ];
  assert.deepEqual(routes.sort(compareEvaluatedRoutes).map((route) => route.routeId),
    ["medium-a", "medium-b", "high"]);

  const tied = [
    { routeId: "long", predictedRiskLevel: "Low", classProbabilities: { High: 0.01, Medium: 0.09 }, durationMinutes: 50, distanceKm: 30 },
    { routeId: "short", predictedRiskLevel: "Low", classProbabilities: { High: 0.01, Medium: 0.09 }, durationMinutes: 40, distanceKm: 35 },
  ];
  assert.equal(tied.sort(compareEvaluatedRoutes)[0].routeId, "short");
});

test("route endpoint selects lower-risk distinct evidence and returns map geometry comparison", async () => {
  setDependenciesForTesting({
    getRouteAlternatives: async () => [
      { routeId: "fast", isFastestRoute: true, distanceKm: 100, durationMinutes: 100, roadNames: ["A1"], geometry: { type: "LineString", coordinates: [[79, 6], [80, 7]] } },
      { routeId: "lower", isFastestRoute: false, distanceKm: 112, durationMinutes: 116, roadNames: ["A2", "Unmapped connector"], geometry: { type: "LineString", coordinates: [[79, 6], [81, 7]] } },
    ],
    getRoadDataByRouteLabels: async (labels) => ({
      ...standardRoadInfo,
      "Route/Segment Name": labels[0],
      _matchedRouteFamily: labels[0],
      _matchedLabelCount: 1,
      _routeLabelCount: labels.length,
    }),
    graphManager: availableGraphManager,
    runRiskPrediction: async (input) => input.terrain === "Hilly" && input.gradient === 12
      ? successfulPrediction()
      : successfulPrediction(),
  });
  let call = 0;
  setDependenciesForTesting({
    runRiskPrediction: async () => (++call === 1
      ? { ...(await successfulPrediction()), riskLevel: "High", probabilities: { Low: 0.1, Medium: 0.2, High: 0.7 } }
      : { ...(await successfulPrediction()), riskLevel: "Low", probabilities: { Low: 0.8, Medium: 0.15, High: 0.05 } }),
  });

  const response = await requestRouteRecommendation();
  assert.equal(response.status, 200);
  assert.equal(response.body.recommendedRoute.routeId, "lower");
  assert.equal(response.body.routeResult.mode, "lower-risk-recommended");
  assert.equal(response.body.routeResult.comparisonAvailable, true);
  assert.equal(response.body.routeResult.routeGeometryAvailable, true);
  assert.deepEqual(response.body.recommendedRoute.geometry.coordinates, [[79, 6], [81, 7]]);
  assert.equal(response.body.recommendedRoute.roadEvidenceCoverage,
    "partial-provider-label-coverage");
  assert.equal(response.body.comparison.extraMinutesVsFastest, 16);
  assert.equal(response.body.comparison.extraDistanceKmVsFastest, 12);
});

test("route endpoint handles one route and does not rank duplicate or insufficient evidence", async () => {
  setDependenciesForTesting({
    getRouteAlternatives: async () => [
      { routeId: "one", isFastestRoute: true, distanceKm: 10, durationMinutes: 20, roadNames: ["A1"], geometry: null },
      { routeId: "duplicate", distanceKm: 12, durationMinutes: 24, roadNames: ["A1"], geometry: null },
      { routeId: "unknown", distanceKm: 13, durationMinutes: 25, roadNames: [], geometry: null },
    ],
    getRoadDataByRouteLabels: async (labels) => labels.length ? {
      ...standardRoadInfo,
      _matchedRouteFamily: "A1 Colombo-Kandy",
      _matchedLabelCount: 1,
      _routeLabelCount: 1,
    } : null,
    graphManager: availableGraphManager,
    runRiskPrediction: successfulPrediction,
  });
  const response = await requestRouteRecommendation();
  assert.equal(response.status, 200);
  assert.equal(response.body.comparison.evaluatedRouteCount, 1);
  assert.equal(response.body.alternatives[1].evidenceAvailable, false);
  assert.equal(response.body.alternatives[2].roadEvidenceCoverage, "unavailable");
  assert.equal(response.body.recommendedRoute, null);
  assert.equal(response.body.routeResult.mode, "default-analyzed-route");
  assert.equal(response.body.routeResult.comparisonAvailable, false);
  assert.equal(response.body.routeResult.geometry, null);
  assert.equal(response.body.routeResult.routeGeometryAvailable, false);
});

test("route endpoint returns controlled no-route and outage failures", async () => {
  setDependenciesForTesting({ getRouteAlternatives: async () => [] });
  assertControlledFailure(await requestRouteRecommendation(), 422, "ROUTE_NOT_FOUND");

  setDependenciesForTesting({ getRouteAlternatives: async () => {
    throw routeFailure("ROUTE_SERVICE_ERROR");
  } });
  assertControlledFailure(await requestRouteRecommendation(), 503, "ROUTE_SERVICE_UNAVAILABLE");
});

test("non-default selected route drives vehicle gradient and ignores client evidence", async () => {
  let predictionCall = 0;
  setDependenciesForTesting({
    getRouteAlternatives: async () => [
      { routeId: "fast", isFastestRoute: true, distanceKm: 100, durationMinutes: 100, roadNames: ["A1"], geometry: null },
      { routeId: "selected", distanceKm: 110, durationMinutes: 115, roadNames: ["A2"], geometry: null },
    ],
    getRoadDataByRouteLabels: async (labels) => ({
      ...standardRoadInfo,
      "Max Gradient (%)": labels[0] === "A2" ? "7" : "12",
      _matchedRouteFamily: labels[0],
      _matchedLabelCount: 1,
      _routeLabelCount: 1,
    }),
    graphManager: availableGraphManager,
    runRiskPrediction: async () => (++predictionCall === 1
      ? { ...(await successfulPrediction()), riskLevel: "High", probabilities: { Low: 0.1, Medium: 0.2, High: 0.7 } }
      : { ...(await successfulPrediction()), riskLevel: "Low", probabilities: { Low: 0.8, Medium: 0.15, High: 0.05 } }),
  });

  const response = await requestRouteRecommendation({
    startingLocation: "Colombo",
    destination: "Kandy",
    budget: 1000000,
    passengers: 2,
    gradient: 99,
    riskLevel: "High",
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.recommendedRoute.routeId, "selected");
  assert.equal(response.body.vehicleIntegration.usesRecommendedRoute, true);
  assert.equal(response.body.vehicleIntegration.routeId, "selected");
  assert.equal(response.body.vehicleIntegration.gradient, 7);
  assert.equal(
    response.body.vehicleIntegration.bestVehicle.vehicleSuitability.roadGradient,
    7
  );
  assert.equal(response.body.recommendedRoute.predictedRiskLevel, "Low");
});

test("selected route with unknown gradient keeps suitability unknown and suppresses upsell", async () => {
  setDependenciesForTesting({
    getRouteAlternatives: async () => [
      { routeId: "selected", isFastestRoute: true, distanceKm: 50, durationMinutes: 60, roadNames: ["A1"], geometry: null },
    ],
    getRoadDataByRouteLabels: async () => ({
      ...standardRoadInfo,
      "Max Gradient (%)": null,
      _matchedRouteFamily: "A1",
      _matchedLabelCount: 1,
      _routeLabelCount: 1,
    }),
    graphManager: availableGraphManager,
    runRiskPrediction: successfulPrediction,
  });

  const response = await requestRouteRecommendation({
    startingLocation: "Colombo",
    destination: "Kandy",
    budget: 1000000,
    passengers: 2,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.vehicleIntegration.gradient, null);
  assert.equal(response.body.vehicleIntegration.gradientDataAvailable, false);
  assert.ok(response.body.vehicleIntegration.bestVehicle);
  assert.equal(
    response.body.vehicleIntegration.bestVehicle.vehicleSuitability.gradientSuitability,
    "unknown"
  );
  assert.equal(response.body.vehicleIntegration.higherRoadCapabilityOption, null);
});

test("default selected route uses the shared vehicle recommendation behavior", async () => {
  setDependenciesForTesting({
    getRouteAlternatives: async () => [
      { routeId: "fast", isFastestRoute: true, distanceKm: 100, durationMinutes: 100, roadNames: ["A1"], geometry: null },
    ],
    getRoadDataByRouteLabels: async () => ({
      ...standardRoadInfo,
      _matchedRouteFamily: "A1",
      _matchedLabelCount: 1,
      _routeLabelCount: 1,
    }),
    graphManager: availableGraphManager,
    runRiskPrediction: successfulPrediction,
  });
  const response = await requestRouteRecommendation({
    startingLocation: "Colombo",
    destination: "Kandy",
    budget: 15000,
    passengers: 4,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.vehicleIntegration.routeId, "fast");
  assert.equal(response.body.vehicleIntegration.gradient, 12);
  assert.equal(response.body.vehicleIntegration.usesRecommendedRoute, false);
  assert.equal(response.body.vehicleIntegration.usesSelectedRoute, true);
});

test("unavailable comparison falls back to the map-capable default analyzed route", async () => {
  setDependenciesForTesting({
    getRouteAlternatives: async () => [{
      routeId: "default",
      isFastestRoute: true,
      distanceKm: 42,
      durationMinutes: 55,
      roadNames: [],
      geometry: { type: "LineString", coordinates: [[79, 6], [80, 7]] },
      correctedStartLocation: "Kandy",
      correctedEndLocation: "Kaduwela",
    }],
    getRoadDataByRouteLabels: async () => null,
    getRoadData: async () => standardRoadInfo,
    getWeatherByCoordinates: async () => availableWeather,
    graphManager: availableGraphManager,
    runRiskPrediction: successfulPrediction,
  });

  const response = await requestRouteRecommendation({
    startingLocation: "Kandy",
    destination: "Kaduwela",
    budget: 1000000,
    passengers: 2,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.routeResult.mode, "default-analyzed-route");
  assert.equal(response.body.routeResult.comparisonAvailable, false);
  assert.equal(response.body.routeResult.routeGeometryAvailable, true);
  assert.deepEqual(response.body.routeResult.geometry.coordinates,
    [[79, 6], [80, 7]]);
  assert.equal(response.body.routeResult.vehicleUsesSelectedRoute, true);
  assert.equal(response.body.vehicleIntegration.routeId, "default");
  assert.ok(response.body.bestVehicle);
});

test("GET / returns the health response contract", async () => {
  const response = await request(app).get("/");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, "Healthy");
});

test("static road and vehicle datasets are parsed once per process", async () => {
  resetStaticDataCacheForTesting();

  const firstRoad = await getRoadData(
    "Colombo",
    "Kandy"
  );

  const afterFirstRoad =
    getStaticDataCacheStateForTesting();

  const secondRoad = await getRoadData(
    "Colombo",
    "Kandy"
  );

  assert.deepEqual(secondRoad, firstRoad);
  assert.deepEqual(
    getStaticDataCacheStateForTesting(),
    afterFirstRoad
  );

  const vehiclePath = path.join(
    __dirname,
    "../src/ai-engine/data/processed_vehicles.csv"
  );

  const firstVehicles =
    await loadStaticCsvData(vehiclePath);

  const secondVehicles =
    await loadStaticCsvData(vehiclePath);

  assert.strictEqual(secondVehicles, firstVehicles);
  assert.deepEqual(
    getStaticDataCacheStateForTesting(),
    {
      cachedFileCount: 2,
      pendingLoadCount: 0,
      parseCount: 2,
    }
  );
});

test("failed static dataset reads are not cached", async () => {
  resetStaticDataCacheForTesting();

  await assert.rejects(
    () => loadStaticCsvData(
      path.join(
        __dirname,
        "missing-static-dataset.csv"
      )
    ),
    /CSV file not found/
  );

  assert.deepEqual(
    getStaticDataCacheStateForTesting(),
    {
      cachedFileCount: 0,
      pendingLoadCount: 0,
      parseCount: 0,
    }
  );
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

test("graph outage responses do not expose internal query errors", async () => {
  configureWorkingDependencies({
    graphManager: {
      getMLRiskContext: async () => ({
        matchType: "unavailable",
        historicalOccurrenceCount: null,
        hazardType: "Unknown",
        season: "Unknown",
      }),
      getSafetyReasoning: async () => ({
        status: "unavailable",
        explanation:
          "Historical safety evidence is temporarily unavailable.",
        error:
          "Neo4j connection failed at bolt://internal-host:7687",
      }),
    },
  });

  const response = await requestSafetyAnalysis(
    standardSafetyRequest
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.graphRAG.status, "unavailable");
  assert.equal("error" in response.body.graphRAG, false);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /internal-host|bolt:\/\//i
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
