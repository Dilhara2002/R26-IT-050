function stablePlaceIds(data) {
  const stops = Array.isArray(data?.optimized_stops) ? data.optimized_stops : [];
  const ids = stops.map((stop) => String(stop?.place_id ?? "").trim());
  if (!ids.length || ids.some((placeId) => !placeId) || new Set(ids).size !== ids.length) {
    throw new Error("This itinerary does not contain usable stable place IDs.");
  }
  return ids;
}

function baseRequest(data) {
  const startingLocation = data?.starting_location;
  const preferences = data?.user_preferences;
  if (
    !startingLocation ||
    !Number.isFinite(Number(startingLocation.lat)) ||
    !Number.isFinite(Number(startingLocation.lon)) ||
    !Array.isArray(preferences) ||
    !preferences.length ||
    !Number.isFinite(Number(data?.max_time_allocated_mins))
  ) {
    throw new Error("The original itinerary inputs are incomplete.");
  }
  const request = {
    preferences,
    max_time_minutes: Number(data.max_time_allocated_mins),
    current_lat: Number(startingLocation.lat),
    current_lon: Number(startingLocation.lon),
  };
  if (Number.isFinite(Number(data.search_radius_km))) {
    request.radius_km = Number(data.search_radius_km);
  }
  return request;
}

export function buildReplacementRequest(data, rejectedPlaceId) {
  const placeIds = stablePlaceIds(data);
  const normalizedRejectedId = String(rejectedPlaceId ?? "").trim();
  if (!placeIds.includes(normalizedRejectedId)) {
    throw new Error("The selected stop is no longer part of this itinerary.");
  }
  return {
    ...baseRequest(data),
    generation_mode: "replace_stop",
    excluded_place_ids: [normalizedRejectedId],
    locked_place_ids: placeIds.filter((placeId) => placeId !== normalizedRejectedId),
    replaced_place_id: normalizedRejectedId,
    target_stop_count: placeIds.length,
  };
}

export function buildFullRegenerationRequest(data) {
  return {
    ...baseRequest(data),
    generation_mode: "full_regeneration",
    excluded_place_ids: stablePlaceIds(data),
    locked_place_ids: [],
  };
}

export function regenerationErrorMessage(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    "The itinerary could not be regenerated."
  );
}

export function applySuccessfulRegeneration(currentState, responsePayload) {
  if (
    responsePayload?.status !== "success" ||
    !responsePayload?.data ||
    responsePayload.data.route_changed !== true ||
    !Array.isArray(responsePayload.data.optimized_stops) ||
    !responsePayload.data.optimized_stops.length
  ) {
    throw new Error("The regeneration service returned an unusable or unchanged route.");
  }
  return {
    ...currentState,
    data: responsePayload.data,
    persistence: responsePayload.persistence || null,
    safetyResult: null,
    safetyError: "",
    validationError: "",
    regenerationError: "",
    regenerationLoading: null,
  };
}

export function applyFailedRegeneration(currentState, error) {
  return {
    ...currentState,
    regenerationLoading: null,
    regenerationError: regenerationErrorMessage(error),
  };
}
