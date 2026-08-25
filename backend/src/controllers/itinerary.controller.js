import {
  generateItineraryFromAI
} from "../services/itinerary.service.js";
import Itinerary from "../models/Itinerary.js";


export const optimizeItinerary = async (req, res) => {

  try {

    const {
      preferences,
      max_time_minutes,
      current_lat,
      current_lon
    } = req.body;



    if (!preferences || preferences.length === 0) {

      return res.status(400).json({

        status: "error",

        message:
          "Preferences are required"

      });

    }



    const aiPayload = {

      preferences,

      max_time_minutes:
        max_time_minutes || 480,

      current_lat:
        current_lat || 7.2906,

      current_lon:
        current_lon || 80.6337

    };



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
