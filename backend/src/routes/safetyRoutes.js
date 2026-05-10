const express = require("express");
const router = express.Router();
const graphManager = require("../ai-engine/knowledge-graph/graphManager");

/**
 * @route   POST /api/safety/recommend-vehicle
 * @desc    GraphRAG-based Safety Analysis using Neo4j Knowledge Graph
 */
router.post("/recommend-vehicle", async (req, res) => {
  try {
    // Get route name from frontend request
    const { routeName } = req.body;

    // Validate input
    if (!routeName) {
      return res.status(400).json({
        success: false,
        message: "Route name is required",
      });
    }

    console.log(`🔍 Querying GraphRAG for route: ${routeName}`);

    /**
     * Get safety reasoning from Neo4j Knowledge Graph
     * Since this branch does not use ML prediction,
     * a placeholder value ("N/A") is passed instead of an ML score.
     */
    const graphReasoning = await graphManager.getSafetyReasoning(
      routeName,
      "N/A"
    );

    // Send response back to frontend
    return res.status(200).json({
      success: true,
      branch: "safety-analyzer-GraphRAG",
      analysis: {
        routeName,
        source: "Neo4j Knowledge Graph",
      },
      graphRAG: graphReasoning,
    });
  } catch (error) {
    console.error("GraphRAG Branch Error:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;