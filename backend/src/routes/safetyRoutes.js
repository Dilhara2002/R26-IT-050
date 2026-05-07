const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

/**
 * Helper: Normalizes strings by removing spaces and making them lowercase
 * This ensures "Beragala-Haputale" matches "beragalahaputale"
 */
const normalize = (str) => (str ? str.toString().toLowerCase().replace(/\s+/g, '') : '');

// 1. Function to fetch road data with Smart Fuzzy Matching
const getRoadData = (userProvidedName) => {
    return new Promise((resolve) => {
        let selectedRoad = null;
        const normalizedInput = normalize(userProvidedName);

        fs.createReadStream(path.join(__dirname, '../ai-engine/data/processed_roads.csv'))
            .pipe(csv())
            .on('data', (row) => {
                // Find the correct column name regardless of slight variations
                const csvRouteName = row['Route/Segment Name'] || row['Route Name'] || row['Segment Name'];
                
                if (csvRouteName) {
                    const normalizedCSVName = normalize(csvRouteName);
                    
                    // Smart Matching: Check if the user input is PART of the CSV name or vice versa
                    if (normalizedCSVName.includes(normalizedInput) || normalizedInput.includes(normalizedCSVName)) {
                        selectedRoad = row;
                        console.log(`✅ Match Found in CSV: ${csvRouteName}`);
                    }
                }
            })
            .on('end', () => resolve(selectedRoad));
    });
};

// Helper: Calculate Travel Cost based on your formula
const calculateTrueCost = (distance, efficiency, fuelType) => {
    const fuelPrice = fuelType === 'Diesel' ? 341 : 371; // Current SL rates
    const driverFeePerKm = 50; 
    const profitMargin = 1.20; // 20% margin

    const fuelCost = (distance / parseFloat(efficiency)) * fuelPrice;
    const baseCost = fuelCost + (distance * driverFeePerKm);
    return Math.round(baseCost * profitMargin);
};

// 2. Main API Route
router.post('/recommend-vehicle', async (req, res) => {
    try {
        const { budget, passengers, distance, routeName, isRaining } = req.body;
        
        // A. Get road gradient with Smart Search
        const roadInfo = await getRoadData(routeName);
        if (!roadInfo) {
            return res.status(404).json({ 
                success: false,
                message: `Route '${routeName}' not found in database. Please check spelling.` 
            });
        }

        const vehicles = [];

        // Read vehicle data
        fs.createReadStream(path.join(__dirname, '../ai-engine/data/processed_vehicles.csv'))
            .pipe(csv())
            .on('data', (data) => vehicles.push(data))
            .on('end', async () => {

                // B. Analyze each vehicle via Python ML Model + Cost Formula
                const analyzedVehicles = await Promise.all(
                    vehicles.map(async (v) => {
                        const score = await getMLSafetyScore(v, roadInfo, isRaining);
                        const cost = calculateTrueCost(distance, v['Efficiency (km/L)'], v['Fuel Type']);

                        return {
                            ...v,
                            safetyScore: score,
                            calculatedCost: cost
                        };
                    })
                );

                // C. Selection logic: Budget + Passengers + Safety
                const withinBudget = analyzedVehicles
                    .filter(v =>
                        v.calculatedCost <= budget &&
                        parseInt(v['Seating Capacity']) >= passengers
                    )
                    .sort((a, b) => b.safetyScore - a.safetyScore);

                // Find Upsell (Safer vehicle just slightly above budget)
                const upsellOption = analyzedVehicles
                    .filter(v => v.calculatedCost > budget && v.calculatedCost <= budget * 1.25)
                    .sort((a, b) => b.safetyScore - a.safetyScore)[0];

                res.json({
                    success: true,
                    routeDetected: roadInfo['Route/Segment Name'],
                    roadGradient: roadInfo['Max Gradient (%)'] + "%",
                    bestSafetyMatch: withinBudget[0] || null,
                    otherOptions: withinBudget.slice(1, 3),
                    upsell: upsellOption || null,
                    weatherStatus: isRaining ? "Heavy Rain - Safety scores reduced" : "Clear Weather"
                });
            });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Helper to call Python ML script
const getMLSafetyScore = (vehicle, road, isRaining) => {
    return new Promise((resolve) => {
        const pythonInput = JSON.stringify({
            cc: vehicle['Engine Capacity (CC)'],
            torque: vehicle['Max Torque (Nm)'],
            gradeability: vehicle['Gradeability (%)'],
            gradient: road['Max Gradient (%)'],
            surface: road['Surface_Enc'] || 1, 
            rain: isRaining ? 20 : 0
        });

        // Use 'python3' for macOS
        const py = spawn('python3', [
            path.join(__dirname, '../ai-engine/scripts/predict_safety.py'),
            pythonInput
        ]);

        py.stdout.on('data', (data) => resolve(parseFloat(data.toString())));
        py.stderr.on('data', (data) => console.error(`ML_Error: ${data}`));
    });
};

module.exports = router;