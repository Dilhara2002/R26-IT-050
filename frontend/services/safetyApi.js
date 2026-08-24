import axios from "axios";

const SAFETY_API_BASE_URL =
  process.env.EXPO_PUBLIC_SAFETY_API_BASE_URL ||
  "http://127.0.0.1:8080/api/safety";

const SafetyAPI = axios.create({
  baseURL: SAFETY_API_BASE_URL,
});

const isFiniteCoordinate = (value, minimum, maximum) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= minimum &&
  value <= maximum;

export function getItinerarySafetyAvailability(startingLocation, optimizedStops) {
  if (
    !startingLocation ||
    !isFiniteCoordinate(startingLocation.lat, -90, 90) ||
    !isFiniteCoordinate(startingLocation.lon, -180, 180)
  ) {
    return "Starting coordinates are unavailable for this itinerary.";
  }

  if (!Array.isArray(optimizedStops) || optimizedStops.length === 0) {
    return "Structured itinerary stops are unavailable for this itinerary.";
  }

  if (optimizedStops.length > 8) {
    return "Safety analysis supports up to 8 structured itinerary stops.";
  }

  const stopsAreUsable = optimizedStops.every(
    (stop, index) =>
      stop &&
      Number.isInteger(stop.sequence) &&
      stop.sequence === index + 1 &&
      (typeof stop.place_id === "string" || typeof stop.place_id === "number") &&
      String(stop.place_id).trim() &&
      typeof stop.name === "string" &&
      stop.name.trim() &&
      isFiniteCoordinate(stop.latitude, -90, 90) &&
      isFiniteCoordinate(stop.longitude, -180, 180) &&
      typeof stop.duration_minutes === "number" &&
      Number.isFinite(stop.duration_minutes) &&
      stop.duration_minutes >= 0
  );

  return stopsAreUsable
    ? ""
    : "This itinerary does not contain the complete structured stop data required for safety analysis.";
}

export function buildItinerarySafetyRequest({
  startingLocation,
  optimizedStops,
  budget,
  passengers,
  preferredCategory,
}) {
  return {
    starting_location: {
      lat: startingLocation.lat,
      lon: startingLocation.lon,
      name:
        typeof startingLocation.name === "string" && startingLocation.name.trim()
          ? startingLocation.name.trim()
          : "Starting location",
    },
    optimized_stops: optimizedStops.map((stop) => ({
      sequence: stop.sequence,
      place_id: stop.place_id,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      duration_minutes: stop.duration_minutes,
    })),
    budget,
    passengers,
    ...(preferredCategory ? { preferredCategory } : {}),
  };
}

export async function recommendItinerarySafety(payload) {
  try {
    const response = await SafetyAPI.post("/recommend-itinerary", payload);
    return response.data;
  } catch (error) {
    const responseData = error?.response?.data;
    const requestError = new Error(
      responseData?.message ||
        (error?.response
          ? "Trip safety analysis could not be completed."
          : "Cannot connect to the safety service at the configured API URL.")
    );
    requestError.safetyResponse = responseData;
    throw requestError;
  }
}
