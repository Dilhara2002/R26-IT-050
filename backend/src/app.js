/**
 * Main Entry Point:
 * AI-Powered Safety-Aware Tourism Platform
 *
 * Handles:
 * - Hotel data APIs
 * - Safety recommendation engine
 * - Itinerary APIs
 * - MongoDB connection
 * - Neo4j GraphRAG connection
 */

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import hotelDataRoutes from "./routes/hotelData.routes.js";
import safetyRoutes from "./routes/safetyRoutes.js";
import itineraryRoutes from "./routes/itinerary.routes.js";

import { verifyNeo4jConnection } from "./config/neo4j.js";


dotenv.config();


const app = express();


// -----------------------------
// Middleware
// -----------------------------

app.use(cors());
app.use(express.json());


// -----------------------------
// Health Check
// -----------------------------

app.get("/", (req, res) => {

  res.status(200).json({
    success: true,
    message:
      "AI-Powered Safety-Aware Tourism Platform Backend is Running 🚀",
    status: "Healthy",
    engine: "Real ML Inference + Neo4j GraphRAG"
  });

});


// -----------------------------
// Routes
// -----------------------------

// Hotel APIs
app.use("/api", hotelDataRoutes);


// Safety APIs
app.use(
  "/api/safety",
  safetyRoutes
);


// Itinerary APIs
app.use(
  "/api/itinerary",
  itineraryRoutes
);


// -----------------------------
// Error Handler
// -----------------------------

app.use((err, req, res, next) => {

  console.error(
    "SERVER_ERROR:",
    err.stack
  );


  res.status(500).json({

    success: false,

    message:
      "Internal Server Error",

    error:
      err.message

  });

});


// -----------------------------
// Infrastructure
// -----------------------------

const connectInfrastructure = async () => {


  if (process.env.MONGO_URI) {

    try {

      await mongoose.connect(
        process.env.MONGO_URI
      );


      console.log(
        "✅ Connected to MongoDB Atlas"
      );


    } catch(error) {

      console.error(
        "❌ MongoDB connection error:",
        error.message
      );

    }


  } else {

    console.warn(
      "⚠️ MONGO_URI not found"
    );

  }



  try {

    await verifyNeo4jConnection();

    console.log(
      "✅ Neo4j connection verified"
    );


  } catch(error) {

    console.error(
      "❌ Neo4j error:",
      error.message
    );

  }


};



// -----------------------------
// Start Server
// -----------------------------

const startServer = async () => {


  await connectInfrastructure();


  const PORT =
    process.env.PORT || 5000;


  app.listen(
    PORT,
    () => {

      console.log(
        `🚀 Server running on http://localhost:${PORT}`
      );


      console.log(
        `🔗 Safety API:
http://localhost:${PORT}/api/safety/recommend-vehicle`
      );


      console.log(
        `🗺️ Itinerary API:
http://localhost:${PORT}/api/itinerary`
      );


    }
  );


};


startServer();


export default app;