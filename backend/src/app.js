/**
 * Main Entry Point: AI-Powered Safety-Aware Tourism Platform
 * Branch: safety-analyzer-testing
 * Purpose: Backend orchestration for ML-based safety analysis and vehicle recommendation.
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Import Routes
const safetyRoutes = require("./routes/safetyRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Base API Endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message:
      "AI-Powered Safety-Aware Tourism Platform Testing Branch is Running! 🚀",
    status: "Healthy",
    branch: "safety-analyzer-testing",
    engine: "Real ML Inference + Vehicle Recommendation",
    excluded: "Neo4j GraphRAG is not included in this branch",
    endpoints: {
      safetyRecommendation: "/api/safety/recommend-vehicle",
    },
  });
});

/**
 * Route: /api/safety
 * Purpose:
 * - Real route distance calculation
 * - ML safety score prediction
 * - Dataset-based vehicle filtering
 * - Vehicle recommendation
 * - No GraphRAG / No Neo4j
 */
app.use("/api/safety", safetyRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("TESTING_BRANCH_SERVER_ERROR:", err.stack);

  res.status(500).json({
    success: false,
    branch: "safety-analyzer-testing",
    message: "Internal Server Error in Testing Branch",
    error: err.message,
  });
});

// Server Start
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log("\n=================================================");
  console.log(`🚀 TESTING BRANCH is live on http://localhost:${PORT}`);
  console.log("🧠 Research Engine: Real ML + Vehicle Recommendation");
  console.log(`🔗 Endpoint: http://localhost:${PORT}/api/safety/recommend-vehicle`);
  console.log("=================================================\n");
});