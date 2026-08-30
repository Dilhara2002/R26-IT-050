import axios from "axios";

export const PYTHON_AI_TIMEOUT_MS = 60000;


export const generateItineraryFromAI = async (itineraryData) => {

  try {

    const pythonApiUrl =
      process.env.PYTHON_AI_URL ||
      "http://127.0.0.1:5002";


    const response =
      await axios.post(
        `${pythonApiUrl}/api/optimize-itinerary`,
        itineraryData,
        { timeout: PYTHON_AI_TIMEOUT_MS }
      );


    return response.data;


  } catch (error) {

    const timedOut =
      error.code === "ECONNABORTED" ||
      error.code === "ETIMEDOUT";
    if (timedOut) {
      console.warn(
        `Python AI Engine request timed out after ${PYTHON_AI_TIMEOUT_MS}ms.`
      );
      const safeTimeoutMessage =
        itineraryData?.generation_mode === "full_regeneration"
          ? "This plan variation took longer than expected."
          : itineraryData?.generation_mode === "replace_stop"
            ? "This place replacement took longer than expected."
            : "Itinerary generation took longer than expected.";
      const timeoutError = new Error(
        "The itinerary engine took longer than expected."
      );
      timeoutError.statusCode = 504;
      timeoutError.details = {
        status: "error",
        code: "itinerary_generation_timeout",
        error: safeTimeoutMessage
      };
      throw timeoutError;
    }

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
