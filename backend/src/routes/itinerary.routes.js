const express = require('express');
const router = express.Router();
const itineraryController = require('../controllers/itinerary.controller');

router.post('/optimize', itineraryController.optimizeItinerary);

module.exports = router;