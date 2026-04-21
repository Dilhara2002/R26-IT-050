const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Routes ආනයනය (Importing)
const vehicleRoutes = require('./routes/vehicleRoutes');

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
// PP1 වලදී පැනල් එකට පෙන්වීමට MongoDB Atlas භාවිතා කිරීම වඩාත් සුදුසුයි [cite: 161]
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas (Vehicle Service)'))
    .catch((err) => console.error('❌ Database connection error:', err));

// --- API Endpoints ---

// මූලික Health Check එක [cite: 154]
app.get('/', (req, res) => {
    res.send('Context-Aware Vehicle Recommendation Backend is Running! 🚀');
});

// ඔයාගේ පර්යේෂණ කොටසට අදාළ ප්‍රධාන Route එක [cite: 121, 249]
// මෙහිදී Vehicle Selection සහ Safety Score ගණනය කිරීම් සිදු වේ [cite: 42, 140, 265]
app.use('/api/vehicles', vehicleRoutes);

// --- Server Start ---
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server is live on http://localhost:${PORT}`);
    console.log(`📄 Vehicle Recommendation Engine is active.`);
});