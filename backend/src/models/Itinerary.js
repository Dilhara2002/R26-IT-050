const mongoose = require('mongoose');

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
        lat: { type: Number },
        lon: { type: Number }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Itinerary', itinerarySchema);