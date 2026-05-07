/**
 * Main Entry Point: AI-Powered Safety-Aware Tourism Platform
 * Purpose: Backend orchestration for ML Safety Engine and GraphRAG.
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// --- 1. Import Routes ---
// Note: safetyRoutes is the core of your research component.
const safetyRoutes = require('./routes/safetyRoutes');

// Placeholder for other team members' work (Commented out if file is missing)
// const vehicleRoutes = require('./routes/vehicleRoutes'); 

const app = express();

// --- 2. Middleware ---
app.use(cors());
app.use(express.json());

// --- 3. Database Connection ---
// Ensure MONGO_URI is defined in your .env file
if (process.env.MONGO_URI) {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('✅ Connected to MongoDB Atlas'))
        .catch((err) => console.error('❌ Database connection error:', err));
} else {
    console.warn('⚠️ MONGO_URI not found in .env. Database features may be limited.');
}

// --- 4. API Endpoints ---

// Base Health Check
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'AI-Powered Safety-Aware Tourism Platform Backend is Running! 🚀',
        status: 'Healthy',
        engine: 'ML + GraphRAG Active'
    });
});

/**
 * Route: /api/safety
 * Purpose: Handles Research Logic (Budget filtering, ML Safety Score, GraphRAG reasoning).
 * Primary Endpoint: POST http://localhost:5001/api/safety/recommend-vehicle
 */
app.use('/api/safety', safetyRoutes);

// Optional: Uncomment this only when vehicleRoutes.js is created in src/routes/
// app.use('/api/vehicles', vehicleRoutes);

// --- 5. Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('SERVER_ERROR:', err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Internal Server Error',
        error: err.message 
    });
});

// --- 6. Server Start ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Server is live on http://localhost:${PORT}`);
    console.log(`🧠 Research Engine: Safety-Aware Vehicle Recommendation`);
    console.log(`🔗 Active Endpoint: http://localhost:${PORT}/api/safety/recommend-vehicle`);
    console.log(`=================================================\n`);
});