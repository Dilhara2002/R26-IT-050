import {
  RISK_ORDER,
  analyzeNamedSafetyRoute,
  analyzeSafetyLeg,
  getWholeTripVehicleRecommendation,
} from "../services/safetyAnalysis.service.js";

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = "INVALID_ITINERARY_SAFETY_REQUEST";
  }
}

const validateCoordinate = (value, minimum, maximum, field) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new ValidationError(`${field} must be a finite number between ${minimum} and ${maximum}.`);
  }
};

const normalizePlaceId = (value, index) => {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ValidationError(`optimized_stops[${index}].place_id must be a string or number.`);
  }
  const normalized = String(value).trim();
  if (!normalized) {
    throw new ValidationError(`optimized_stops[${index}].place_id cannot be empty.`);
  }
  return normalized;
};

const validateRequest = (body = {}) => {
  const startingLocation = body.starting_location;
  if (!startingLocation || typeof startingLocation !== "object" || Array.isArray(startingLocation)) {
    throw new ValidationError("starting_location is required and must be an object.");
  }
  validateCoordinate(startingLocation.lat, -90, 90, "starting_location.lat");
  validateCoordinate(startingLocation.lon, -180, 180, "starting_location.lon");
  if (typeof startingLocation.name !== "string" || !startingLocation.name.trim()) {
    throw new ValidationError("starting_location.name must be a non-empty string.");
  }

  if (!Array.isArray(body.optimized_stops) || body.optimized_stops.length < 1 || body.optimized_stops.length > 8) {
    throw new ValidationError("optimized_stops must contain between 1 and 8 stops.");
  }

  const placeIds = new Set();
  const coordinates = new Set([`${startingLocation.lat},${startingLocation.lon}`]);
  const stops = body.optimized_stops.map((stop, index) => {
    if (!stop || typeof stop !== "object" || Array.isArray(stop)) {
      throw new ValidationError(`optimized_stops[${index}] must be an object.`);
    }
    if (!Number.isInteger(stop.sequence) || stop.sequence !== index + 1) {
      throw new ValidationError("optimized_stops sequences must be unique, ordered integers starting at 1.");
    }
    if (typeof stop.name !== "string" || !stop.name.trim()) {
      throw new ValidationError(`optimized_stops[${index}].name must be a non-empty string.`);
    }
    validateCoordinate(stop.latitude, -90, 90, `optimized_stops[${index}].latitude`);
    validateCoordinate(stop.longitude, -180, 180, `optimized_stops[${index}].longitude`);
    if (stop.duration_minutes !== undefined &&
        (typeof stop.duration_minutes !== "number" ||
         !Number.isFinite(stop.duration_minutes) || stop.duration_minutes < 0)) {
      throw new ValidationError(`optimized_stops[${index}].duration_minutes must be a non-negative number when supplied.`);
    }
    const placeId = normalizePlaceId(stop.place_id, index);
    const coordinateKey = `${stop.latitude},${stop.longitude}`;
    if (placeIds.has(placeId)) {
      throw new ValidationError(`Duplicate place_id is not allowed: ${placeId}.`);
    }
    if (coordinates.has(coordinateKey)) {
      throw new ValidationError("Duplicate itinerary coordinates are not allowed.");
    }
    placeIds.add(placeId);
    coordinates.add(coordinateKey);
    return {
      sequence: stop.sequence,
      place_id: placeId,
      name: stop.name.trim(),
      latitude: stop.latitude,
      longitude: stop.longitude,
      ...(stop.duration_minutes !== undefined
        ? { duration_minutes: stop.duration_minutes }
        : {}),
    };
  });

  const budgetProvided = body.budget !== undefined;
  const passengersProvided = body.passengers !== undefined;
  if (budgetProvided !== passengersProvided) {
    throw new ValidationError("budget and passengers must be supplied together.");
  }
  if (budgetProvided && (typeof body.budget !== "number" || !Number.isFinite(body.budget) || body.budget <= 0)) {
    throw new ValidationError("budget must be a positive number.");
  }
  if (passengersProvided && (!Number.isInteger(body.passengers) || body.passengers <= 0)) {
    throw new ValidationError("passengers must be a positive integer.");
  }
  if (body.preferredCategory !== undefined &&
      (typeof body.preferredCategory !== "string" || !body.preferredCategory.trim())) {
    throw new ValidationError("preferredCategory must be a non-empty string when supplied.");
  }

  return {
    startingLocation: {
      lat: startingLocation.lat,
      lon: startingLocation.lon,
      name: startingLocation.name.trim(),
    },
    stops,
    vehicleRequested: budgetProvided,
    budget: body.budget,
    passengers: body.passengers,
    preferredCategory: body.preferredCategory?.trim() || "",
  };
};

const settleWithConcurrency = async (items, limit, operation) => {
  const settlements = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        settlements[index] = { status: "fulfilled", value: await operation(items[index], index) };
      } catch (reason) {
        settlements[index] = { status: "rejected", reason };
      }
    }
  });
  await Promise.allSettled(workers);
  return settlements;
};

const sanitizeLegFailure = (leg, settlement) => ({
  leg_sequence: leg.legSequence,
  from: leg.from,
  to: leg.to,
  status: "failed",
  distance_km: null,
  duration_minutes: null,
  route_geometry: null,
  selected_route_mode: null,
  risk_prediction: null,
  weather: { status: "unavailable" },
  graph_context: { status: "unavailable" },
  risk_evidence_available: false,
  max_gradient: null,
  limitations: ["Core route analysis failed for this leg."],
  error: {
    code: ["ROUTE_NOT_FOUND", "ROUTE_SERVICE_ERROR"].includes(settlement.reason?.code)
      ? settlement.reason.code
      : "LEG_ANALYSIS_FAILED",
    message: "Safety analysis could not be completed for this leg.",
  },
});

const recommendItinerarySafety = async (req, res) => {
  let input;
  try {
    input = validateRequest(req.body);
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: error.code || "INVALID_ITINERARY_SAFETY_REQUEST",
      message: error.message,
    });
  }

  const locations = [
    input.startingLocation,
    ...input.stops.map((stop) => ({
      lat: stop.latitude,
      lon: stop.longitude,
      name: stop.name,
      place_id: stop.place_id,
      sequence: stop.sequence,
    })),
  ];
  const legs = input.stops.map((stop, index) => ({
    legSequence: index + 1,
    from: locations[index],
    to: locations[index + 1],
  }));

  const settlements = await settleWithConcurrency(legs, 2, (leg) => analyzeSafetyLeg(leg));
  const perLegResults = settlements.map((settlement, index) =>
    settlement.status === "fulfilled" ? settlement.value : sanitizeLegFailure(legs[index], settlement)
  );
  const successful = perLegResults.filter((result) => result.status === "success");
  const failed = perLegResults.filter((result) => result.status === "failed");
  const evaluable = successful.filter((result) =>
    result.risk_evidence_available && RISK_ORDER.hasOwnProperty(result.risk_prediction?.riskLevel)
  );
  const worstRisk = evaluable.reduce((worst, result) =>
    !worst || RISK_ORDER[result.risk_prediction.riskLevel] > RISK_ORDER[worst]
      ? result.risk_prediction.riskLevel
      : worst
  , null);
  const tripRiskComplete = failed.length === 0 && evaluable.length === legs.length;
  const partialFailures = failed.map((result) => ({
    leg_sequence: result.leg_sequence,
    from: result.from,
    to: result.to,
    error: result.error,
  }));

  let vehicleRecommendation = {
    status: "not_requested",
    reason: "budget and passengers were not supplied.",
  };
  if (input.vehicleRequested) {
    if (successful.length === 0) {
      vehicleRecommendation = {
        status: "unavailable",
        reason: "No successful route evidence was available for a whole-trip vehicle recommendation.",
      };
    } else {
      const distances = successful.map((result) => result.distance_km).filter(Number.isFinite);
      const gradients = successful.map((result) => result.max_gradient).filter(Number.isFinite);
      vehicleRecommendation = await getWholeTripVehicleRecommendation({
        distanceKm: distances.length === successful.length
          ? Number(distances.reduce((total, distance) => total + distance, 0).toFixed(2))
          : null,
        maxGradient: gradients.length ? Math.max(...gradients) : null,
        riskLevel: worstRisk,
        budget: input.budget,
        passengers: input.passengers,
        preferredCategory: input.preferredCategory,
      });
    }
  }

  const response = {
    success: successful.length > 0,
    partial: failed.length > 0,
    tripRiskComplete,
    original_optimized_stop_order: input.stops,
    per_leg_safety_results: perLegResults,
    whole_trip_risk_summary: {
      risk_level: worstRisk,
      aggregation_method: "maximum_successful_leg_risk",
      successful_legs: successful.length,
      failed_legs: failed.length,
      evaluable_risk_legs: evaluable.length,
      total_legs: legs.length,
      complete: tripRiskComplete,
    },
    vehicle_recommendation: vehicleRecommendation,
    partial_failures: partialFailures,
  };

  return res.status(successful.length ? 200 : 503).json(response);
};

const recommendRouteSafety = async (req, res) => {
  const startLocation = req.body?.startingLocation ?? req.body?.startLocation;
  const endLocation = req.body?.destination ?? req.body?.endLocation;
  if (typeof startLocation !== "string" || !startLocation.trim() ||
      typeof endLocation !== "string" || !endLocation.trim()) {
    return res.status(400).json({
      success: false,
      code: "INVALID_REQUEST",
      message: "startingLocation and destination are required.",
    });
  }
  const budgetProvided = req.body?.budget !== undefined;
  const passengersProvided = req.body?.passengers !== undefined;
  if (budgetProvided !== passengersProvided) {
    return res.status(400).json({
      success: false,
      code: "INVALID_VEHICLE_REQUEST",
      message: "budget and passengers must be supplied together.",
    });
  }
  const budget = req.body?.budget;
  const passengers = req.body?.passengers;
  if (budgetProvided &&
      (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0 ||
       !Number.isInteger(passengers) || passengers <= 0)) {
    return res.status(400).json({
      success: false,
      code: "INVALID_VEHICLE_REQUEST",
      message: "budget must be positive and passengers must be a positive integer.",
    });
  }

  try {
    const result = await analyzeNamedSafetyRoute({
      startLocation: startLocation.trim(),
      endLocation: endLocation.trim(),
    });
    const vehicle = budgetProvided
      ? await getWholeTripVehicleRecommendation({
        distanceKm: result.distance_km,
        maxGradient: result.max_gradient,
        riskLevel: result.risk_prediction?.riskLevel || null,
        budget,
        passengers,
        preferredCategory: typeof req.body?.preferredCategory === "string"
          ? req.body.preferredCategory.trim()
          : "",
      })
      : null;
    return res.json({
      success: true,
      routeResult: {
        mode: result.selected_route_mode,
        selectedRouteMode: result.selected_route_mode,
        routeGeometryAvailable: Boolean(result.route_geometry),
        startLocation: result.from.name,
        endLocation: result.to.name,
        distanceKm: result.distance_km,
        durationMinutes: result.duration_minutes,
        geometry: result.route_geometry,
        predictedRiskLevel: result.risk_prediction?.riskLevel || null,
        confidence: result.risk_prediction?.confidence ?? null,
        confidencePercent: result.risk_prediction?.confidencePercent ?? null,
        classProbabilities: result.risk_prediction?.probabilities || null,
        modelName: result.risk_prediction?.modelName || null,
        evidenceAvailable: result.risk_evidence_available,
        comparisonAvailable: result.selected_route_mode === "lower-risk-recommended",
        vehicleUsesSelectedRoute: Boolean(vehicle?.bestVehicle),
      },
      riskPrediction: result.risk_prediction,
      trip: {
        from: result.from.name,
        to: result.to.name,
        distanceKm: result.distance_km,
        durationMinutes: result.duration_minutes,
        passengers: passengersProvided ? passengers : null,
        preferredCategory: typeof req.body?.preferredCategory === "string"
          ? req.body.preferredCategory.trim()
          : "",
      },
      analysis: {
        gradient: result.max_gradient,
        terrain: result.terrain,
        roadSurface: result.road_surface,
        weather: result.weather?.weatherDescription || null,
        temperature: result.weather?.temperature ?? null,
        rainDetected: result.weather?.isRaining ?? null,
        graphContext: result.graph_context,
      },
      vehicleIntegration: vehicle,
      bestVehicle: vehicle?.bestVehicle || null,
      alternativeOptions: vehicle?.alternativeOptions || [],
      graphRAG: result.graph_context?.reasoning || {
        status: result.graph_context?.status || "unavailable",
      },
    });
  } catch (error) {
    const status = error.code === "ROUTE_NOT_FOUND" ? 422 : 503;
    return res.status(status).json({
      success: false,
      code: error.code === "ROUTE_NOT_FOUND" ? "ROUTE_NOT_FOUND" : "ROUTE_SERVICE_UNAVAILABLE",
      message: status === 422
        ? "No drivable route was found between the resolved locations."
        : "Route safety analysis is temporarily unavailable.",
    });
  }
};

export {
  recommendItinerarySafety,
  recommendRouteSafety,
  validateRequest,
  settleWithConcurrency,
};
