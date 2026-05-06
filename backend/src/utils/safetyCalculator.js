const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const graphManager = require('../ai-engine/knowledge-graph/graphManager');

// Helper function to read CSV data and filter suitable vehicles
const getFilteredVehicles = (budget, passengers) => {
    return new Promise((resolve) => {
        const results = [];

        fs.createReadStream(path.join(__dirname, '../ai-engine/data/processed_vehicles.csv'))
            .pipe(csv())
            .on('data', (data) => {
                // Check whether the vehicle matches the passenger count
                // Note: The CSV file should contain "Seating Capacity" and "Price" columns
                if (parseInt(data['Seating Capacity']) >= passengers) {
                    results.push(data);
                }
            })
            .on('end', () => resolve(results));
    });
};

router.post('/analyze-safety', async (req, res) => {
    try {
        const { budget, passengers, startLocation, endLocation, rainLevel } = req.body;

        // 1. Filter vehicles based on user input
        const suitableVehicles = await getFilteredVehicles(budget, passengers);
        
        if (suitableVehicles.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No vehicles found for your requirements."
            });
        }

        // Select the first suitable vehicle as an example
        const selectedVehicle = suitableVehicles[0];

        // 2. Road data
        // Currently, static sample values are used
        // Later, this can be fetched dynamically from a road dataset or API
        const roadInfo = {
            gradient: 12.5,
            surface: 1,
            routeName: "Kandy-Ellagawa Road"
        };

        // 3. Prepare input data for the Python ML model
        const pythonInput = JSON.stringify({
            cc: parseFloat(selectedVehicle['Engine Capacity (CC)']),
            torque: parseFloat(selectedVehicle['Max Torque (Nm)']),
            gradeability: parseFloat(selectedVehicle['Gradeability (%)']),
            gradient: roadInfo.gradient,
            surface: roadInfo.surface,
            rain: rainLevel === 'High' ? 20 : 5
        });

        // 4. Call Python script to get prediction from ML model
        const pythonProcess = spawn('python3', [
            path.join(__dirname, '../ai-engine/scripts/predict_safety.py'),
            pythonInput
        ]);

        pythonProcess.stdout.on('data', (data) => {
            const mlScore = parseFloat(data.toString());

            // 5. Generate explanation using GraphRAG
            const reasoning = graphManager.getSafetyReasoning(
                roadInfo.routeName,
                mlScore
            );

            // 6. Send final response to frontend
            res.json({
                success: true,
                vehicle: selectedVehicle['Model Name'],
                safetyScore: mlScore,
                explanation: reasoning,
                costEstimate: "LKR 12,500",
                recommendation:
                    mlScore > 70
                        ? "Recommended for travel"
                        : "Use caution - route has high risks"
            });
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;