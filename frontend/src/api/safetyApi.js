import axios from "axios";

const API_BASE_URL = "http://192.168.1.8:5001/api";

export const getVehicleRecommendation = async (payload) => {
  const response = await axios.post(
    `${API_BASE_URL}/safety/recommend-vehicle`,
    payload
  );

  return response.data;
};