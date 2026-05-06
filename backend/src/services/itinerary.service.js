const axios = require('axios');

const generateItineraryFromAI = async (itineraryData) => {
    try {
        const pythonApiUrl = process.env.PYTHON_AI_URL || 'http://127.0.0.1:5000';
        
        const response = await axios.post(`${pythonApiUrl}/api/optimize-itinerary`, itineraryData);
        
        return response.data;
    } catch (error) {
        console.error("Error communicating with Python AI Engine:", error.message);
        throw new Error("Failed to generate itinerary from AI Engine");
    }
};

module.exports = {
    generateItineraryFromAI
};