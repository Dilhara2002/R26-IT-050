import axios from "axios";

export const ITINERARY_API_TIMEOUT_MS = 55000;

const API = axios.create({
  baseURL: "http://192.168.1.6:5000/api",
  timeout: ITINERARY_API_TIMEOUT_MS
});

export default API;
