import Itinerary from "../models/Itinerary.js";

export const itineraryDatabaseReady = (model = Itinerary) => model.db?.readyState === 1;

export const persistGeneratedItinerarySafely = async ({
  ownerUserId,
  itineraryData,
  model = Itinerary,
}) => {
  if (!ownerUserId) {
    return { status: "skipped", saved: false, reason: "authentication_required" };
  }
  if (!itineraryDatabaseReady(model)) {
    return { status: "skipped", saved: false, reason: "database_unavailable" };
  }
  try {
    const trip = new model({
      ownerUserId,
      itineraryData,
      userPreferences: itineraryData.user_preferences,
      maxTimeAllocatedMins: itineraryData.max_time_allocated_mins,
      estimatedTimeRequired: itineraryData.estimated_time_required,
      optimizedRoute: itineraryData.optimized_route,
      aiSummary: itineraryData.ai_summary,
      searchRadiusKm: itineraryData.search_radius_km,
      startingLocation: itineraryData.starting_location,
    });
    await trip.save();
    return { status: "saved", saved: true, itineraryId: String(trip._id) };
  } catch {
    return { status: "failed", saved: false, reason: "database_write_failed" };
  }
};

export const listOwnedItineraries = async (ownerUserId, model = Itinerary) => {
  if (!itineraryDatabaseReady(model)) return null;
  return model.find({ ownerUserId }).sort({ createdAt: -1 }).lean();
};

export const deleteOwnedItinerary = async (ownerUserId, itineraryId, model = Itinerary) => {
  if (!itineraryDatabaseReady(model)) return null;
  return model.findOneAndDelete({ _id: itineraryId, ownerUserId });
};
