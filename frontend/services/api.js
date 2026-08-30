import axios from "axios";

const SHARED_API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "http://localhost:5000/api"
).replace(/\/$/, "");

const API_BASE_URL =
  process.env.EXPO_PUBLIC_ITINERARY_API_BASE_URL ||
  `${SHARED_API_BASE_URL}/itinerary`;

const API = axios.create({
  baseURL: API_BASE_URL
});

export default API;
