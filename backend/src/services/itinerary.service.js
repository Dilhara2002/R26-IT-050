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

    if (error.response?.data) {
      const controlledExhaustion =
        error.response.status === 409 &&
        error.response.data.code === "no_additional_feasible_alternative";
      if (!controlledExhaustion) {
        console.error(
          "Error communicating with Python AI Engine:",
          error.message
        );
      }
      const upstreamError = new Error(
        error.response.data.error ||
        error.response.data.message ||
        "The itinerary engine rejected the request."
      );
      upstreamError.statusCode = error.response.status;
      upstreamError.details = error.response.data;
      throw upstreamError;
    }

    console.error(
      "Error communicating with Python AI Engine:",
      error.message
    );
    throw new Error("Failed to generate itinerary from AI Engine");


  }

};
