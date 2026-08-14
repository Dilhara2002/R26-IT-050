import {
  generateItineraryFromAI
} from "../services/itinerary.service.js";
import Itinerary from "../models/Itinerary.js";
import mongoose from "mongoose";


export const optimizeItinerary = async (req, res) => {

  try {

    const {
      preferences,
      max_time_minutes,
      current_lat,
      current_lon
    } = req.body;



    if (!Array.isArray(preferences) || preferences.length === 0) {

      return res.status(400).json({
        success: false,
        data: null,
        error: { code: "VALIDATION_ERROR", message: "Preferences are required" },
        status: "error",
        message: "Preferences are required"
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



      if (mongoose.connection.readyState === 1) {
        await newTrip.save();


        console.log(
        "New itinerary saved to database successfully!"
      );
      }

    }



    return res.status(200).json(
      aiResponse
    );



  } catch(error) {


    return res.status(error.code === "ECONNABORTED" ? 504 : 503).json({
      success: false,
      data: null,
      error: {
        code: error.code === "ECONNABORTED" ? "OPTIMIZER_TIMEOUT" : "OPTIMIZER_UNAVAILABLE",
        message: error.message
      },
      status: "error",
      message: error.message
    });


  }

};
