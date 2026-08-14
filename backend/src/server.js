import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const [{ default: app }, { verifyNeo4jConnection, closeNeo4jConnection }] = await Promise.all([
  import("./app.js"),
  import("./config/neo4j.js"),
]);

const port = Number(process.env.PORT || 5001);

async function connectInfrastructure() {
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("Connected to MongoDB");
    } catch (error) {
      console.warn("MongoDB unavailable; itinerary persistence is disabled:", error.message);
    }
  } else {
    console.warn("MONGO_URI is not configured; itinerary persistence is disabled.");
  }

  try {
    await verifyNeo4jConnection();
    console.log("Connected to Neo4j");
  } catch (error) {
    console.warn("Neo4j unavailable; graph-backed features may be limited:", error.message);
  }
}

await connectInfrastructure();

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; shutting down.`);
  server.close(async () => {
    await Promise.allSettled([
      mongoose.connection.readyState ? mongoose.disconnect() : Promise.resolve(),
      closeNeo4jConnection(),
    ]);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
