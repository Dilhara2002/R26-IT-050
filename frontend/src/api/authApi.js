import axios from "axios";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8080/api"
).replace(/\/$/, "");

const request = async (path, payload) => {
  const response = await axios.post(`${API_BASE_URL}/auth/${path}`, payload, { timeout: 10000 });
  return response.data;
};

export const loginUser = (email, password) => request("login", { email, password });
export const registerUser = (name, email, password) =>
  request("register", { name, email, password });
