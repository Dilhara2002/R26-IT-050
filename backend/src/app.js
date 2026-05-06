const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Node.js Backend is running' });
});

const itineraryRoutes = require('./routes/itinerary.routes');
app.use('/api/itinerary', itineraryRoutes);

module.exports = app;