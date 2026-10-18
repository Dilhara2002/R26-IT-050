import axios from "axios";
import { API_BASE_URL } from "./apiBase";
import { rememberSession, sessionRequestConfig } from "./authApi";


export const adminLogin = async (email, password) => {
  const response = await axios.post(`${API_BASE_URL}/admin/login`, { email, password }, sessionRequestConfig());
  return rememberSession(response.data);
};

export const getVehiclePricing = async (token) => {
  const response = await axios.get(`${API_BASE_URL}/admin/vehicle-pricing`, {
    ...sessionRequestConfig(),
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  return response.data.vehicles || [];
};

export const updateVehiclePricing = async (token, vehicleName, values) => {
  const response = await axios.put(
    `${API_BASE_URL}/admin/vehicle-pricing/${encodeURIComponent(vehicleName)}`,
    values,
    { ...sessionRequestConfig(), ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) }
  );
  return response.data;
};
