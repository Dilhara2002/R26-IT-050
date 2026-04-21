const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');
const { calculateSafetyScore } = require('../utils/safetyCalculator');

// @route   POST /api/vehicles/recommend
// @desc    Get vehicle recommendation based on terrain and context
router.post('/recommend', async (req, res) => {
    try {
        const { 
            destination, 
            budget, 
            passengers, 
            routeGradient, // පාරේ බෑවුම (Google Elevation API එකෙන් එන දත්ත)
            weatherCondition // සජීවී කාලගුණය (Weather API එකෙන් එන දත්ත)
        } = req.body;

        // 1. මුලින්ම යූසර්ගේ බජට් එකට සහ පිරිසට ගැළපෙන වාහන Database එකෙන් ගන්න
        let availableVehicles = await Vehicle.find({
            maxPassengers: { $gte: passengers }
        });

        // 2. රිසර්ච් එකේ "Context-Aware" කොටස: හැම වාහනයකටම Safety Score එකක් ගණනය කිරීම
        const recommendations = availableVehicles.map(vehicle => {
            const safetyScore = calculateSafetyScore(
                vehicle.engineCC, 
                passengers, 
                routeGradient, 
                weatherCondition
            );

            // True Trip Cost එක ගණනය කිරීම (Engine strain සහ Gradient මත පදනම්ව)
            // දුරට අමතරව බෑවුම අනුව ඉන්ධන වියදම වැඩිවන ආකාරය මෙහිදී සලකා බලයි
            const terrainFactor = 1 + (routeGradient / 100); 
            const estimatedTrueCost = (vehicle.fuelEfficiency * terrainFactor).toFixed(2);

            return {
                vehicleId: vehicle._id,
                modelName: vehicle.modelName,
                engineCC: vehicle.engineCC,
                safetyScore: safetyScore,
                trueTripCost: estimatedTrueCost,
                isRecommended: safetyScore >= 70 // 70% ට වඩා වැඩි නම් පමණක් නිර්දේශ කරයි
            };
        });

        // 3. ආරක්ෂිත බව වැඩිම වාහනය මුලට එන සේ සකස් කිරීම (Sorting)
        recommendations.sort((a, b) => b.safetyScore - a.safetyScore);

        res.status(200).json({
            success: true,
            context: {
                gradient: routeGradient,
                weather: weatherCondition
            },
            recommendations: recommendations
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;