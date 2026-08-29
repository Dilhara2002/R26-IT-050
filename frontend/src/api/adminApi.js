import axios from "axios";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5001/api";

export const adminLogin = async (email, password) => {
  const response = await axios.post(`${API_BASE_URL}/admin/login`, { email, password }, { timeout: 10000 });
  return response.data;
};

export const getVehiclePricing = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/admin/vehicle-pricing`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
  });
  return response.data.vehicles || [];
};

export const updateVehiclePricing = async (token, vehicleName, values) => {
  const response = await axios.put(
    `${API_BASE_URL}/admin/vehicle-pricing/${encodeURIComponent(vehicleName)}`,
    values,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
  );
  return response.data;
};
