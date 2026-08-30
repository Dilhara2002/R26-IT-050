import mongoose from "mongoose";


const itinerarySchema = new mongoose.Schema({

  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  itineraryData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

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
