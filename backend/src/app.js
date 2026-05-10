/**
 * Main Entry Point: AI-Powered Safety-Aware Tourism Platform
 * Purpose: Backend orchestration for ML Safety Engine, MongoDB, and Neo4j GraphRAG.
 */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const { verifyNeo4jConnection } = require("./config/neo4j");

// --- 1. Import Routes ---
const safetyRoutes = require("./routes/safetyRoutes");

const app = express();

// --- 2. Middleware ---
app.use(cors());
app.use(express.json());

// --- 3. MongoDB Connection ---
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch((err) =>
      console.error("❌ MongoDB connection error:", err.message)
    );
} else {
  console.warn("⚠️ MONGO_URI not found in .env. MongoDB features may be limited.");
}

// --- 4. Neo4j Knowledge Graph Connection ---
verifyNeo4jConnection();

// --- 5. API Endpoints ---
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "AI-Powered Safety-Aware Tourism Platform Backend is Running! 🚀",
    status: "Healthy",
    engine: "Real ML Inference + Neo4j GraphRAG Active",
    endpoints: {
      safetyRecommendation: "/api/safety/recommend-vehicle",
    },
  });
});

/**
 * Route: /api/safety
 * Purpose: Handles Research Logic:
 * - Real route distance calculation
 * - ML safety score prediction
 * - GraphRAG reasoning
 * - Vehicle recommendation
 */
app.use("/api/safety", safetyRoutes);

// --- 6. Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("SERVER_ERROR:", err.stack);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

// --- 7. Server Start ---
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log("\n=================================================");
  console.log(`🚀 Server is live on http://localhost:${PORT}`);
  console.log("🧠 Research Engine: Real ML + Neo4j GraphRAG");
  console.log(`🔗 Active Endpoint: http://localhost:${PORT}/api/safety/recommend-vehicle`);
  console.log("=================================================\n");
});