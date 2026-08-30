import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://localhost:5001/api";

const COMBINED_ANALYSIS_TIMEOUT_MS = 70000;

export const getVehicleRecommendation = async (payload) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/safety/recommend-vehicle`,
      payload,
      {
        timeout: 20000,
      }
    );

    if (!response.data) {
      throw new Error("No data received from server.");
    }

    if (response.data.success === false) {
      return {
        success: false,
        error: true,
        message:
          response.data.message ||
          response.data.error ||
          "Recommendation failed.",
      };
    }

    return response.data;
  } catch (error) {
    console.log("Safety API Error:", error.message);

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      (error.code === "ECONNABORTED"
        ? "Request timeout. Server took too long to respond."
        : null) ||
      (!error.response
        ? "Cannot connect to backend server. Check the API URL and ensure the backend is running."
        : null) ||
      "Failed to generate vehicle recommendation.";

    return {
      success: false,
      error: true,
      message,
    };
  }
};

export const getLowerRiskRoute = async (payload) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/safety/recommend-route`,
      {
        ...payload,
        startingLocation: payload.startLocation,
        destination: payload.endLocation,
      },
      { timeout: COMBINED_ANALYSIS_TIMEOUT_MS }
    );

    if (!response.data) {
      throw new Error("No data received from server.");
    }

    return response.data;
  } catch (error) {
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      (error.code === "ECONNABORTED"
        ? "Combined route and vehicle analysis timed out. Please try again."
        : null) ||
      (!error.response
        ? "Cannot connect to backend server. Check the API URL and ensure the backend is running."
        : null) ||
      "Failed to analyze this route and recommend a vehicle.";

    return {
      success: false,
      error: true,
      message,
    };
  }
};

export const getItinerarySafetyRecommendation = async (payload) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/safety/recommend-itinerary`,
      payload,
      { timeout: COMBINED_ANALYSIS_TIMEOUT_MS }
    );
    if (!response.data) throw new Error("No data received from server.");
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: true,
      message:
        error.response?.data?.message ||
        error.response?.data?.error ||
        (error.code === "ECONNABORTED"
          ? "Itinerary safety and vehicle analysis timed out. Please try again."
          : null) ||
        (!error.response
          ? "Cannot connect to the backend. Check that the Node backend is running and try again."
          : null) ||
        "The itinerary could not be analyzed for a vehicle recommendation.",
    };
  }
};
