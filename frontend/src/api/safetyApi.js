import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://localhost:5001/api";

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
