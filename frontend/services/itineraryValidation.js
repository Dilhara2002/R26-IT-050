export const MAX_ITINERARY_MINUTES = 1440;
export const MIN_RADIUS_KM = 0.1;
export const MAX_RADIUS_KM = 100;

function parseOptionalWholeNumber(rawValue, fieldName) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) return 0;
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative whole number.`);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a finite whole number.`);
  }
  return value;
}

export function parseAvailableTime(hours, minutes) {
  const hourValue = parseOptionalWholeNumber(hours, "Hours");
  const minuteValue = parseOptionalWholeNumber(minutes, "Minutes");
  if (minuteValue > 59) {
    throw new Error("Minutes must be between 0 and 59.");
  }
  const totalMinutes = hourValue * 60 + minuteValue;
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes <= 0) {
    throw new Error("Available time must be greater than zero.");
  }
  if (totalMinutes > MAX_ITINERARY_MINUTES) {
    throw new Error("Available time cannot exceed 24 hours.");
  }
  return totalMinutes;
}

function parseDecimal(rawValue, fieldName, minimum, maximum) {
  const normalized = String(rawValue ?? "").trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`${fieldName} must be a valid decimal number.`);
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${fieldName} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function parseStartingCoordinates(latitude, longitude) {
  return {
    latitude: parseDecimal(latitude, "Latitude", -90, 90),
    longitude: parseDecimal(longitude, "Longitude", -180, 180),
  };
}

export function parseOptionalRadius(radius) {
  const normalized = String(radius ?? "").trim();
  if (!normalized) return null;
  return parseDecimal(normalized, "Travel radius", MIN_RADIUS_KM, MAX_RADIUS_KM);
}

export function formatAvailableTime(totalMinutes) {
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes <= 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (!minutes) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minutes`;
}

export function validateItineraryForm({
  preferences,
  hours,
  minutes,
  latitude,
  longitude,
  radius,
}) {
  const errors = {};
  let totalMinutes = null;
  let coordinates = null;
  let radiusKm = null;

  if (!Array.isArray(preferences) || preferences.length === 0) {
    errors.preferences = "Select at least one interest so relevance can be evaluated.";
  }
  let latitudeValue = null;
  let longitudeValue = null;
  try {
    latitudeValue = parseDecimal(latitude, "Latitude", -90, 90);
  } catch (error) {
    errors.latitude = error.message || "Enter a valid latitude.";
  }
  try {
    longitudeValue = parseDecimal(longitude, "Longitude", -180, 180);
  } catch (error) {
    errors.longitude = error.message || "Enter a valid longitude.";
  }
  if (!errors.latitude && !errors.longitude) {
    coordinates = { latitude: latitudeValue, longitude: longitudeValue };
  }
  try {
    totalMinutes = parseAvailableTime(hours, minutes);
  } catch (error) {
    errors.time = error.message || "Enter a valid available time.";
  }
  try {
    radiusKm = parseOptionalRadius(radius);
  } catch (error) {
    errors.radius = error.message || "Enter a valid travel radius.";
  }

  const fieldOrder = ["latitude", "longitude", "preferences", "time", "radius"];
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    firstInvalidField: fieldOrder.find((field) => errors[field]) || null,
    values: {
      preferences: Array.isArray(preferences) ? [...preferences] : [],
      totalMinutes,
      latitude: coordinates?.latitude ?? null,
      longitude: coordinates?.longitude ?? null,
      radiusKm,
    },
  };
}

export function itineraryRequestError(error) {
  const status = error?.response?.status;
  const code = error?.response?.data?.code;
  const serverMessage = error?.response?.data?.message || error?.response?.data?.error;
  if (!error?.response) {
    return {
      kind: "service_unavailable",
      title: "AI service unavailable",
      message: "The itinerary services could not be reached. Your inputs have been kept; check the local services and try again.",
    };
  }
  if (status === 400) {
    return {
      kind: "invalid_input",
      title: "Check your trip details",
      message: serverMessage || "One or more trip details were rejected. Review the highlighted fields and try again.",
    };
  }
  if (status === 404 || status === 409) {
    return {
      kind: code === "no_additional_feasible_alternative" ? "exhausted" : "no_feasible_itinerary",
      title: status === 409 ? "No additional feasible plan" : "No feasible itinerary found",
      message: serverMessage || "The bounded verified catalogue could not produce a plan for these constraints.",
    };
  }
  return {
    kind: "unexpected_server_error",
    title: "Unexpected server error",
    message: serverMessage || "The itinerary could not be generated. Your inputs have been kept so you can try again.",
  };
}
