
import mongoose from "mongoose";

// ---------------------------------------
// Itinerary Schema
// ---------------------------------------

const itinerarySchema = new mongoose.Schema({

  // -------------------------------------
  // User Ownership
  // -------------------------------------

  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: function () {
      return this.itineraryData != null;
    },
    index: true
  },

  // -------------------------------------
  // Complete Generated Itinerary Data
  // -------------------------------------

  itineraryData: {
    type: mongoose.Schema.Types.Mixed,
    required: function () {
      return this.ownerUserId != null;
    }
  },

  // -------------------------------------
  // Planning Snapshot
  // -------------------------------------

  // Preserve reproducible road-plan evidence
  // and planning options from the main branch.

  planningSnapshot: {
    type: mongoose.Schema.Types.Mixed
  },

  // -------------------------------------
  // User Preferences
  // -------------------------------------

  userPreferences: {
    type: [String],
    required: function () {
      return this.itineraryData == null;
    }
  },

  // -------------------------------------
  // Maximum Time Allocation
  // -------------------------------------

  maxTimeAllocatedMins: {
    type: Number,
    required: function () {
      return this.itineraryData == null;
    }
  },

  // -------------------------------------
  // Estimated Time Required
  // -------------------------------------

  estimatedTimeRequired: {
    type: String
  },

  // -------------------------------------
  // Optimized Route
  // -------------------------------------

  optimizedRoute: {
    type: [String]
  },

  // -------------------------------------
  // AI Generated Summary
  // -------------------------------------

  aiSummary: {
    type: String
  },

  // -------------------------------------
  // Search Radius
  // -------------------------------------

  searchRadiusKm: {
    type: Number
  },

  // -------------------------------------
  // Starting Location
  // -------------------------------------

  startingLocation: {
    lat: {
      type: Number
    },

    lon: {
      type: Number
    }
  },

  // -------------------------------------
  // Creation Date
  // -------------------------------------

  createdAt: {
    type: Date,
    default: Date.now
  }

});

// ---------------------------------------
// Export Itinerary Model
// ---------------------------------------

export default mongoose.model(
  "Itinerary",
  itinerarySchema
);
