import axios from "axios";

// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:5001/api",
  timeout: 35000,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data;
    const normalized = new Error(
      payload?.error?.message || payload?.message || error.message || "Request failed"
    );
    normalized.code = payload?.error?.code || payload?.code || error.code;
    normalized.status = error.response?.status;
    return Promise.reject(normalized);
  }
);

export function unwrap(response) {
  const payload = response.data;
  if (payload?.success === false) {
    throw new Error(payload.error?.message || payload.message || "Request failed");
  }
  return payload?.data ?? payload;
}
