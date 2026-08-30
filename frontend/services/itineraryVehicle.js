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

  const preferredCategory = String(form?.preferredCategory || "").trim();
  return {
    starting_location: {
      lat: Number(startingLocation.lat),
      lon: Number(startingLocation.lon),
      name: String(startingLocation.name || "Itinerary starting point").trim(),
    },
    optimized_stops: optimizedStops,
    budget,
    passengers,
    ...(preferredCategory ? { preferredCategory } : {}),
  };
}
