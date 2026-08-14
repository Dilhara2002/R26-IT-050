import cors from "cors";
import express from "express";

import hotelDataRoutes from "./routes/hotelData.routes.js";
import itineraryRoutes from "./routes/itinerary.routes.js";
import safetyRoutes from "./routes/safetyRoutes.js";

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:8081,http://localhost:19006")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: false,
};

const healthPayload = {
  success: true,
  data: {
    status: "healthy",
    service: "tourism-platform-api",
  },
  error: null,
  // Compatibility fields for the existing regression suite and clients.
  status: "Healthy",
  endpoints: {
    recommendations: "/api/recommendations/packages",
    itineraryOptimization: "/api/itineraries/optimize",
    safetyRecommendation: "/api/safety/recommend-vehicle",
  },
};

const app = express();

app.disable("x-powered-by");
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.get(["/", "/api/health"], (req, res) => {
  res.status(200).json(healthPayload);
});

app.use("/api", hotelDataRoutes);
app.use("/api/itinerary", itineraryRoutes);
app.use("/api/itineraries", itineraryRoutes);
app.use("/api/safety", safetyRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: { code: "NOT_FOUND", message: "Endpoint not found." },
  });
});

app.use((err, req, res, next) => {
  console.error("SERVER_ERROR:", err.message);
  res.status(err.message === "Origin is not allowed by CORS" ? 403 : 500).json({
    success: false,
    data: null,
    error: {
      code: err.message === "Origin is not allowed by CORS" ? "CORS_DENIED" : "INTERNAL_ERROR",
      message: err.message === "Origin is not allowed by CORS"
        ? err.message
        : "Internal Server Error",
    },
  });
});

export default app;
