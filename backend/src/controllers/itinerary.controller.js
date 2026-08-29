import {
  generateItineraryFromAI
} from "../services/itinerary.service.js";
import Itinerary from "../models/Itinerary.js";

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
    target_stop_count
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
    target_stop_count
  };
  Object.entries(additiveFields).forEach(([field, value]) => {
    if (value !== undefined) {
      payload[field] = field === "radius_km"
        ? requireFiniteNumber(value, "radius_km", 0.1, 100)
        : value;
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


      const newTrip = new Itinerary({

        userPreferences:
          aiResponse.data.user_preferences,


        maxTimeAllocatedMins:
          aiResponse.data.max_time_allocated_mins,


        estimatedTimeRequired:
          aiResponse.data.estimated_time_required,


        optimizedRoute:
          aiResponse.data.optimized_route,


        aiSummary:
          aiResponse.data.ai_summary,


        searchRadiusKm:
          aiResponse.data.search_radius_km,


        startingLocation:
          aiResponse.data.starting_location

      });



      if (Itinerary.db.readyState === 1) {
        try {
          await newTrip.save();
          aiResponse.persistence = {
            status: "saved",
            saved: true
          };
          console.log(
            "New itinerary saved to database successfully!"
          );
        } catch {
          aiResponse.persistence = {
            status: "failed",
            saved: false
          };
          console.warn(
            "Itinerary persistence failed; returning the optimized itinerary without saving."
          );
        }
      } else {
        aiResponse.persistence = {
          status: "skipped",
          saved: false
        };
        console.warn(
          "Itinerary persistence skipped because MongoDB is not connected."
        );
      }

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
