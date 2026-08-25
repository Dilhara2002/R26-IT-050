import axios from "axios";


export const generateItineraryFromAI = async (itineraryData) => {

  try {

    const pythonApiUrl =
      process.env.PYTHON_AI_URL ||
      "http://127.0.0.1:5000";


    const response =
      await axios.post(
        `${pythonApiUrl}/api/optimize-itinerary`,
        itineraryData
      );


    return response.data;


  } catch (error) {


    console.error(
      "Error communicating with Python AI Engine:",
      error.message
    );


    if (error.response?.data) {
      const upstreamError = new Error(
        error.response.data.error ||
        error.response.data.message ||
        "The itinerary engine rejected the request."
      );
      upstreamError.statusCode = error.response.status;
      upstreamError.details = error.response.data;
      throw upstreamError;
    }

    throw new Error("Failed to generate itinerary from AI Engine");


  }

};
