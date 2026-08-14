import axios from "axios";


export const generateItineraryFromAI = async (itineraryData) => {

  try {

    const pythonApiUrl =
      process.env.PYTHON_AI_URL ||
      "http://127.0.0.1:5000";


    const response =
      await axios.post(
        `${pythonApiUrl}/api/optimize-itinerary`,
        itineraryData,
        { timeout: Number(process.env.PYTHON_AI_TIMEOUT_MS || 30000) }
      );


    return response.data;


  } catch (error) {


    console.error(
      "Error communicating with Python AI Engine:",
      error.message
    );


    const serviceError = new Error(
      error.response?.data?.error?.message || "Failed to generate itinerary from AI Engine"
    );
    serviceError.code = error.code;
    throw serviceError;


  }

};
