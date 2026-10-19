export function buildItineraryVehiclePayload(itinerary, form) {
  const startingLocation = itinerary?.starting_location;
  const stops = Array.isArray(itinerary?.optimized_stops) ? itinerary.optimized_stops : [];
  const budget = Number(form?.budget);
  const passengers = Number(form?.passengers);

  if (!startingLocation || !Number.isFinite(Number(startingLocation.lat)) ||
      !Number.isFinite(Number(startingLocation.lon)) || !stops.length) {
    throw new Error("This itinerary does not contain a usable route.");
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("Enter a budget greater than zero.");
  }
  if (!Number.isInteger(passengers) || passengers <= 0) {
    throw new Error("Enter a valid whole-number passenger count.");
  }

  const optimizedStops = stops.map((stop, index) => {
    const latitude = Number(stop?.latitude);
    const longitude = Number(stop?.longitude);
    const placeId = String(stop?.place_id ?? "").trim();
    const name = String(stop?.name ?? "").trim();
    if (!placeId || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("One or more itinerary stops are missing route coordinates.");
    }
    return {
      sequence: index + 1,
      place_id: placeId,
      name,
      latitude,
      longitude,
      ...(Number.isFinite(Number(stop.duration_minutes))
        ? { duration_minutes: Number(stop.duration_minutes) }
        : {}),
    };
  });

  const returnToStart = itinerary?.planning_options?.return_to_start ??
    itinerary?.travel_estimation?.includes_return_to_start ?? false;
  if (typeof returnToStart !== "boolean") {
    throw new Error("The itinerary return-to-start setting must be true or false.");
  }
  const preferredCategory = String(form?.preferredCategory || "").trim();
  return {
    starting_location: {
      lat: Number(startingLocation.lat),
      lon: Number(startingLocation.lon),
      name: String(startingLocation.name || "Itinerary starting point").trim(),
    },
    optimized_stops: optimizedStops,
    return_to_start: returnToStart,
    budget,
    passengers,
    ...(preferredCategory ? { preferredCategory } : {}),
  };
}

// Presentation only: route retrieval, risk evidence and quotation completeness differ.
export function buildItinerarySafetySummary(result) {
  const legs = Array.isArray(result?.per_leg_safety_results) ? result.per_leg_safety_results : [];
  const risk = result?.whole_trip_risk_summary;
  const validRisk = value => ["High", "Medium", "Low"].includes(value);
  const total = Math.max(legs.length, Number.isInteger(risk?.total_legs) ? risk.total_legs : 0);
  const routes = legs.filter(leg => leg.status === "success");
  const evidenced = routes.filter(leg => leg.risk_evidence_available === true && validRisk(leg.risk_prediction?.riskLevel));
  const completeLegs = evidenced.filter(leg => Number.isFinite(leg.max_gradient) && leg.max_gradient >= 0 &&
    Number.isFinite(leg.distance_km) && leg.distance_km > 0);
  const complete = total > 0 && completeLegs.length === total && risk?.complete === true &&
    !result?.partial && !result?.incomplete_legs?.length;
  return {
    title: complete ? "Whole-trip safety summary" : "Partial safety summary",
    riskLabel: complete ? "Whole-trip risk level" : "Highest observed risk (evaluated legs only)",
    riskValue: evidenced.length > 0 && validRisk(risk?.risk_level) ? risk.risk_level : "Unavailable",
    routeCoverage: `${routes.length}/${total}`,
    riskCoverage: `${evidenced.length}/${total}`,
    safetyCoverage: `${completeLegs.length}/${total}`,
    complete,
  };
}
