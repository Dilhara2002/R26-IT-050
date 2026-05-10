/**
 * Project: AI-Powered Safety-Aware Tourism Platform
 * Branch: safety-analyzer-Graphrag
 * Purpose: Backend Entry Point focused on Neo4j Knowledge Graph & GraphRAG Reasoning.
 */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Importing Neo4j configuration
const { verifyNeo4jConnection } = require("./config/neo4j");

// --- 1. Import Routes ---
// Note: In this branch, safetyRoutes.js should contain GraphRAG-specific logic
const safetyRoutes = require("./routes/safetyRoutes");

const app = express();

// --- 2. Middleware ---
app.use(cors());
app.use(express.json());

// --- 3. MongoDB Connection (Optional for this Research Branch) ---
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch((err) =>
      console.error("❌ MongoDB connection error:", err.message)
    );
}

// --- 4. Neo4j Knowledge Graph Connection (MANDATORY for this Branch) ---
// This branch focuses on GraphRAG, so Neo4j must be active.
verifyNeo4jConnection();

// --- 5. Base API Endpoint ---
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Tourism Safety Platform: GraphRAG Research Branch is Running! 🚀",
    status: "Active",
    focus: "Knowledge Graph Reasoning (Neo4j)",
    engine: "GraphRAG Inference Active",
    endpoints: {
      graphAnalysis: "/api/safety/recommend-vehicle",
    },
  });
});

/**
 * Route: /api/safety
 * Dedicated to GraphRAG Research Logic:
 * - Historical Disaster Risk Retrieval
 * - Knowledge Graph Relationship Mapping
 * - Road-to-Hazard Contextual Reasoning
 */
app.use("/api/safety", safetyRoutes);

// --- 6. Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("GRAPH_BRANCH_SERVER_ERROR:", err.stack);

  res.status(500).json({
    success: false,
    message: "Internal Server Error in GraphRAG Branch",
    error: err.message,
  });
});

// --- 7. Server Start ---
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log("\n=================================================");
  console.log(`🚀 GRAPH-RAG BRANCH is live on http://localhost:${PORT}`);
  console.log("🧠 Research Focus: Neo4j Knowledge Graph Reasoning");
  console.log(`🔗 Endpoint: http://localhost:${PORT}/api/safety/recommend-vehicle`);
  console.log("=================================================\n");
});