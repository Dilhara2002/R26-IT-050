const { driver } = require("../../config/neo4j");

const normalize = (value) =>
  value ? value.toString().toLowerCase().trim() : "";

class GraphManager {
  async getRouteRisks(routeName) {
    const session = driver.session();

    try {
      const result = await session.run(
        `
        MATCH (r:Road)-[:HAS_RISK]->(d:DisasterRisk)
        WHERE toLower(r.routeName) CONTAINS toLower($routeName)
           OR toLower($routeName) CONTAINS toLower(r.routeName)
           OR any(word IN split(toLower($routeName), " ")
              WHERE size(word) > 3 AND toLower(r.routeName) CONTAINS word)
        RETURN
          r.routeName AS matchedRoute,
          d.routeName AS disasterRoute,
          d.riskType AS riskType,
          d.severity AS severity,
          d.primaryFactor AS primaryFactor,
          d.recommendation AS recommendation
        LIMIT 10
        `,
        {
          routeName: routeName || "",
        }
      );

      return result.records.map((record) => ({
        matchedRoute: record.get("matchedRoute"),
        disasterRoute: record.get("disasterRoute"),
        riskType: record.get("riskType"),
        severity: record.get("severity"),
        primaryFactor: record.get("primaryFactor"),
        recommendation: record.get("recommendation"),
      }));
    } catch (error) {
      console.error("Neo4j Graph Query Error:", error.message);
      return [];
    } finally {
      await session.close();
    }
  }

  async getSafetyReasoning(routeName, mlScore, isRaining = false) {
    const risks = await this.getRouteRisks(routeName);

    let explanation = `The ML model predicted a safety score of ${mlScore}%. `;

    if (risks.length > 0) {
      const highRisk =
        risks.find((risk) => normalize(risk.severity) === "high") || risks[0];

      explanation += `Neo4j GraphRAG found ${risks.length} related historical risk record(s) for this route. `;
      explanation += `The most relevant risk is ${highRisk.riskType || "road hazard"} with ${highRisk.severity || "unknown"} severity. `;
      explanation += `Main factor: ${highRisk.primaryFactor || "route condition"}. `;
      explanation += `Recommendation: ${highRisk.recommendation || "Travel carefully and monitor road conditions."}`;
    } else {
      explanation += "Neo4j GraphRAG did not find a strong historical disaster relationship for this route. ";
      explanation += "The recommendation is mainly based on ML prediction, road gradient, vehicle capability, and weather condition.";
    }

    if (isRaining) {
      explanation += " Rain condition was detected, so the safety score was reduced.";
    }

    return {
      source: "Neo4j Knowledge Graph",
      explanation,
      matchedRisks: risks,
      riskCount: risks.length,
    };
  }
}

module.exports = new GraphManager();