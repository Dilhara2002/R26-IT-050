import {
  generateItineraryFromAI
} from "../services/itinerary.service.js";
import mongoose from "mongoose";
import {
  deleteOwnedItinerary,
  listOwnedItineraries,
  persistGeneratedItinerarySafely,
} from "../services/itineraryPersistence.service.js";

const requireFiniteNumber = (value, field, minimum, maximum, fallback) => {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "number" || !Number.isFinite(candidate) ||
      candidate < minimum || candidate > maximum) {
    const error = new Error(`${field} must be a finite number between ${minimum} and ${maximum}.`);
    error.statusCode = 400;
    throw error;
  }
  return candidate;
};

const normalizePlanSignature = (value, field) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    const error = new Error(`${field} must contain between 1 and 8 place IDs.`);
    error.statusCode = 400;
    throw error;
  }
  const normalized = value.map((placeId) => {
    if (typeof placeId !== "string" && typeof placeId !== "number") {
      const error = new Error(`${field} must contain stable string or number IDs.`);
      error.statusCode = 400;
      throw error;
    }
    return String(placeId).trim();
  });
  if (normalized.some((placeId) => !placeId) || new Set(normalized).size !== normalized.length) {
    const error = new Error(`${field} must contain unique, non-empty place IDs.`);
    error.statusCode = 400;
    throw error;
  }
  return normalized.sort();
};

const normalizeRecentPlanSignatures = (value) => {
  if (!Array.isArray(value) || value.length > 8) {
    const error = new Error("recent_plan_signatures must contain at most 8 signatures.");
    error.statusCode = 400;
    throw error;
  }
  const normalized = value.map((signature, index) =>
    normalizePlanSignature(signature, `recent_plan_signatures[${index}]`)
  );
  if (new Set(normalized.map((signature) => JSON.stringify(signature))).size !== normalized.length) {
    const error = new Error("recent_plan_signatures cannot contain duplicate signatures.");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

export const buildItineraryPayload = (body) => {
  const {
    preferences,
    max_time_minutes,
    current_lat,
    current_lon,
    radius_km,
    excluded_place_ids,
    locked_place_ids,
    generation_mode,
    replaced_place_id,
    target_stop_count,
    current_plan_signature,
    recent_plan_signatures
  } = body;

  const payload = {
    preferences,
    max_time_minutes: requireFiniteNumber(max_time_minutes, "max_time_minutes", 1, 1440, 480),
    current_lat: requireFiniteNumber(current_lat, "current_lat", -90, 90, 7.2906),
    current_lon: requireFiniteNumber(current_lon, "current_lon", -180, 180, 80.6337)
  };
  const additiveFields = {
    radius_km,
    excluded_place_ids,
    locked_place_ids,
    generation_mode,
    replaced_place_id,
    target_stop_count,
    current_plan_signature,
    recent_plan_signatures
  };
  Object.entries(additiveFields).forEach(([field, value]) => {
    if (value !== undefined) {
      if (field === "radius_km") {
        payload[field] = requireFiniteNumber(value, "radius_km", 0.1, 100);
      } else if (field === "target_stop_count") {
        if (!Number.isInteger(value) || value < 1 || value > 8) {
          const error = new Error("target_stop_count must be an integer from 1 to 8.");
          error.statusCode = 400;
          throw error;
        }
        payload[field] = value;
      } else if (field === "current_plan_signature") {
        payload[field] = normalizePlanSignature(value, field);
      } else if (field === "recent_plan_signatures") {
        payload[field] = normalizeRecentPlanSignatures(value);
      } else {
        payload[field] = value;
      }
    }
  });
  return payload;
};


export const optimizeItinerary = async (req, res) => {

  try {

    const { preferences } = req.body;



    if (!preferences || preferences.length === 0) {

      return res.status(400).json({

        status: "error",

        message:
          "Preferences are required"

      });

    }



    const aiPayload = buildItineraryPayload(req.body);



    const aiResponse =
  await generateItineraryFromAI(
    aiPayload
  );



    if (
      aiResponse.status === "success" &&
      aiResponse.data
    ) {


      aiResponse.persistence = await persistGeneratedItinerarySafely({
        ownerUserId: req.user?._id,
        itineraryData: aiResponse.data,
      });

    }



    return res.status(200).json(
      aiResponse
    );



  } catch(error) {


    const statusCode = Number.isInteger(error.statusCode)
      ? error.statusCode
      : 500;
    const details = error.details && typeof error.details === "object"
      ? error.details
      : null;

    return res.status(statusCode).json(
      details || {
        status: "error",
        message: error.message
      }
    );


  }

};

export const getSavedItineraries = async (req, res) => {
  const itineraries = await listOwnedItineraries(req.user._id);
  if (itineraries === null) {
    return res.status(503).json({ success: false, message: "Saved itineraries are temporarily unavailable." });
  }
  return res.json({
    success: true,
    itineraries: itineraries.map((trip) => ({
      id: String(trip._id),
      createdAt: trip.createdAt,
      data: trip.itineraryData,
    })),
  });
};

export const removeSavedItinerary = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Invalid itinerary ID." });
  }
  const deleted = await deleteOwnedItinerary(req.user._id, req.params.id);
  if (deleted === null) {
    return res.status(503).json({ success: false, message: "Saved itineraries are temporarily unavailable." });
  }
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Itinerary not found." });
  }
  return res.json({ success: true });
};
