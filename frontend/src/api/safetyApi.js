import axios from "axios";

const API_BASE_URL = "http://192.168.1.8:5001/api";

export const getVehicleRecommendation = async (payload) => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/safety/recommend-vehicle`,
      payload,
      {
        timeout: 15000,
      }
    );

    // Check if response exists
    if (!response.data) {
      throw new Error("No data received from server");
    }

    return response.data;

  } catch (error) {
    console.log("API Error:", error);

    // Backend custom error message
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||

      // Network errors
      (error.code === "ECONNABORTED"
        ? "Request timeout. Server took too long to respond."
        : null) ||

      // Axios no response
      (!error.response
        ? "Cannot connect to backend server."
        : null) ||

      // Default fallback
      "Failed to generate vehicle recommendation.";

    // Return structured error
    return {
      success: false,
      error: true,
      message,
    };
  }
};