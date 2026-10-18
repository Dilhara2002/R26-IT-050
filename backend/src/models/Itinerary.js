import mongoose from "mongoose";


const itinerarySchema = new mongoose.Schema({

  // Additive snapshot: preserve old fields and store reproducible road-plan evidence.
  planningSnapshot: { type: mongoose.Schema.Types.Mixed },

  userPreferences: {

    type: [String],

    required: true

  },


  maxTimeAllocatedMins: {

    type: Number,

    required: true

  },


  estimatedTimeRequired: {

    type: String

  },


  optimizedRoute: {

    type: [String]

  },


  aiSummary: {

    type: String

  },


  searchRadiusKm: {

    type: Number

  },


  startingLocation: {

    lat: {

      type: Number

    },

    lon: {

      type: Number

    }

  },


  createdAt: {

    type: Date,

    default: Date.now

  }


});



export default mongoose.model(
  "Itinerary",
  itinerarySchema
);