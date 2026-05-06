const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// --- 1. Import Routes ---
const vehicleRoutes = require('./routes/vehicleRoutes');
const safetyRoutes = require('./routes/safetyRoutes'); // Added for your Research Component

const app = express();

// --- 2. Middleware ---
app.use(cors());
app.use(express.json());

// --- 3. Database Connection ---
// Ensure MONGO_URI is defined in your .env file
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch((err) => console.error('❌ Database connection error:', err));

// --- 4. API Endpoints ---

// Health Check Route
app.get('/', (req, res) => {
    res.send('AI-Powered Safety-Aware Tourism Platform Backend is Running! 🚀');
});

/**
 * Route: /api/vehicles
 * Handles: General vehicle CRUD operations (from existing members)
 */
app.use('/api/vehicles', vehicleRoutes);

/**
 * Route: /api/safety
 * Handles: Your Research Component (Budget, Passengers, ML Safety Score, GraphRAG)
 * This is where the core logic of your project resides.
 */
app.use('/api/safety', safetyRoutes);

// --- 5. Global Error Handler (Optional but professional) ---
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// --- 6. Server Start ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server is live on http://localhost:${PORT}`);
    console.log(`🧠 AI Safety Engine & GraphRAG is active.`);
    console.log(`🔗 API Endpoint: http://localhost:${PORT}/api/safety/analyze-safety`);
});