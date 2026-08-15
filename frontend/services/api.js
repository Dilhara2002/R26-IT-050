import axios from "axios";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL ||
  "http://127.0.0.1:8080/api/itinerary";

const API = axios.create({
  baseURL: API_BASE_URL
});

export default API;
