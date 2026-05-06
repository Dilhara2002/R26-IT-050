const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

// 1. Function to fetch road data
const getRoadData = (routeName) => {
    return new Promise((resolve) => {
        let selectedRoad = null;

        fs.createReadStream(path.join(__dirname, '../ai-engine/data/processed_roads.csv'))
            .pipe(csv())
            .on('data', (data) => {
                if (data['Route/Segment Name'] === routeName) {
                    selectedRoad = data;
                }
            })
            .on('end', () => resolve(selectedRoad));
    });
};

// 2. Main API Route
router.post('/recommend-vehicle', async (req, res) => {
    try {
        const { budget, passengers, distance, routeName, isRaining } = req.body;
        
        // A. Get road gradient and related data
        const roadInfo = await getRoadData(routeName);
        if (!roadInfo) {
            return res.status(404).json({ message: "Route data not found" });
        }

        const vehicles = [];

        // Read vehicle data from CSV
        fs.createReadStream(path.join(__dirname, '../ai-engine/data/processed_vehicles.csv'))
            .pipe(csv())
            .on('data', (data) => vehicles.push(data))
            .on('end', async () => {

                // B. Filter and analyze each vehicle (Safety + Cost)
                const analyzedVehicles = await Promise.all(
                    vehicles.map(async (v) => {

                        // Get safety score from Python ML model
                        const score = await getMLSafetyScore(v, roadInfo, isRaining);

                        // Calculate cost
                        const cost = calculateTrueCost(
                            distance,
                            v['Efficiency (km/L)'],
                            v['Fuel Type']
                        );

                        return {
                            ...v,
                            safetyScore: score,
                            calculatedCost: cost
                        };
                    })
                );

                // C. Selection logic
                // Select vehicles that match budget + passenger count and sort by highest safety
                const recommendations = analyzedVehicles
                    .filter(v =>
                        v.calculatedCost <= budget &&
                        parseInt(v['Seating Capacity']) >= passengers
                    )
                    .sort((a, b) => b.safetyScore - a.safetyScore);

                // Send response
                res.json({
                    success: true,
                    bestSafetyMatch: recommendations[0] || null,
                    roadGradient: roadInfo['Max Gradient (%)'],
                    weatherImpact: isRaining
                        ? "High impact due to rain"
                        : "Normal",
                    upsell: analyzedVehicles.find(v =>
                        v.calculatedCost > budget &&
                        v.calculatedCost <= budget * 1.2
                    )
                });
            });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to call Python ML model
const getMLSafetyScore = (vehicle, road, isRaining) => {
    return new Promise((resolve) => {

        const pythonInput = JSON.stringify({
            cc: vehicle['Engine Capacity (CC)'],
            torque: vehicle['Max Torque (Nm)'],
            gradeability: vehicle['Gradeability (%)'],
            gradient: road['Max Gradient (%)'],
            surface: road['Surface_Enc'],
            rain: isRaining ? 20 : 0 // Increase risk if raining
        });

        const py = spawn('python3', [
            path.join(__dirname, '../ai-engine/scripts/predict_safety.py'),
            pythonInput
        ]);

        py.stdout.on('data', (data) => {
            resolve(parseFloat(data.toString()));
        });
    });
};

module.exports = router;