import mongoose from "mongoose";


const itinerarySchema = new mongoose.Schema({

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


  optimizedRoute: [{
    id: String,
    name: { type: String, required: true },
    latitude: Number,
    longitude: Number,
    durationMinutes: Number,
    order: Number
  }],


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


}, { timestamps: true });



export default mongoose.model(
  "Itinerary",
  itinerarySchema
);
