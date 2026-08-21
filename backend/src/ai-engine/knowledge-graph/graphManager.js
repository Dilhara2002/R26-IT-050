const { driver } = require("../../config/neo4j");


// --------------------------------------------------
// Helpers
// --------------------------------------------------

const normalize = (value) =>
  value
    ? String(value).trim()
    : "";


const extractRouteCode = (value) => {
  const text = normalize(value);

  const match = text.match(
    /^(A\d+|B-\w+|B\d+|E\d+)/i
  );

  if (!match) {
    return null;
  }

  return match[1].toUpperCase();
};


const extractSegmentNumber = (value) => {
  const text = normalize(value);

  const match = text.match(
    /Segment\s+(\d+)/i
  );

  if (!match) {
    return null;
  }

  return Number(match[1]);
};


const toNativeNumber = (value) => {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "object" &&
    typeof value.toNumber === "function"
  ) {
    return value.toNumber();
  }

  const converted = Number(value);

  return Number.isFinite(converted)
    ? converted
    : null;
};


// --------------------------------------------------
// Graph Manager
// --------------------------------------------------

class GraphManager {

  // ==================================================
  // Get route risks
  // ==================================================

  async getRouteRisks(routeName) {
    const session = driver.session();

    try {
      const routeCode =
        extractRouteCode(routeName);

      if (!routeCode) {
        return {
          routeCode: null,
          matchType: "no-match",
          matchedRoute: null,
          matchedRisks: [],
          riskCount: 0,
        };
      }


      const segmentNumber =
        extractSegmentNumber(routeName);


      // ------------------------------------------------
      // 1. Exact road-segment hazard match
      // ------------------------------------------------

      if (segmentNumber !== null) {

        const exactResult =
          await session.run(
            `
            MATCH
              (route:Route {
                routeCode: $routeCode
              })
              -[:HAS_SEGMENT]->
              (segment:RoadSegment {
                segmentNumber: $segmentNumber
              })
              -[relationship:HAS_HAZARD]->
              (risk:DisasterRisk)

            RETURN
              route.routeCode
                AS routeCode,

              segment.routeName
                AS matchedRoute,

              segment.segmentKey
                AS segmentKey,

              risk.riskId
                AS riskId,

              risk.routeName
                AS disasterRoute,

              risk.riskType
                AS riskType,

              risk.severity
                AS severity,

              risk.primaryFactor
                AS primaryFactor,

              risk.season
                AS season,

              risk.historicalOccurrenceCount
                AS historicalOccurrenceCount,

              risk.recommendation
                AS recommendation,

              coalesce(
                relationship.matchType,
                risk.matchType,
                "exact"
              )
                AS matchType

            ORDER BY
              risk.historicalOccurrenceCount
              DESC

            LIMIT 10
            `,
            {
              routeCode,
              segmentNumber,
            }
          );


        if (
          exactResult.records.length > 0
        ) {
          const risks =
            exactResult.records.map(
              (record) =>
                this.mapRiskRecord(
                  record
                )
            );


          return {
            routeCode,
            matchType: "exact",
            matchedRoute:
              exactResult.records[0]
                .get("matchedRoute"),
            matchedRisks: risks,
            riskCount: risks.length,
          };
        }
      }


      // ------------------------------------------------
      // 2. Route-level historical evidence
      // ------------------------------------------------

      const routeResult =
        await session.run(
          `
          MATCH
            (route:Route {
              routeCode: $routeCode
            })
            -[relationship:HAS_RISK]->
            (risk:DisasterRisk)

          RETURN
            route.routeCode
              AS routeCode,

            route.routeCode
              AS matchedRoute,

            null
              AS segmentKey,

            risk.riskId
              AS riskId,

            risk.routeName
              AS disasterRoute,

            risk.riskType
              AS riskType,

            risk.severity
              AS severity,

            risk.primaryFactor
              AS primaryFactor,

            risk.season
              AS season,

            risk.historicalOccurrenceCount
              AS historicalOccurrenceCount,

            risk.recommendation
              AS recommendation,

            coalesce(
              relationship.matchType,
              risk.matchType,
              "route-level"
            )
              AS matchType

          ORDER BY
            risk.historicalOccurrenceCount
            DESC

          LIMIT 10
          `,
          {
            routeCode,
          }
        );


      if (
        routeResult.records.length > 0
      ) {
        const risks =
          routeResult.records.map(
            (record) =>
              this.mapRiskRecord(
                record
              )
          );


        return {
          routeCode,
          matchType: "route-level",
          matchedRoute:
            routeResult.records[0]
              .get("matchedRoute"),
          matchedRisks: risks,
          riskCount: risks.length,
        };
      }


      // ------------------------------------------------
      // 3. No graph match
      // ------------------------------------------------

      return {
        routeCode,
        matchType: "no-match",
        matchedRoute: null,
        matchedRisks: [],
        riskCount: 0,
      };

    } catch (error) {

      console.error(
        "Neo4j Graph Query Error:",
        error.message
      );


      return {
        routeCode:
          extractRouteCode(
            routeName
          ),

        matchType:
          "unavailable",

        matchedRoute:
          null,

        matchedRisks:
          [],

        riskCount:
          0,

        error:
          error.message,
      };

    } finally {

      await session.close();

    }
  }


  // ==================================================
  // Convert Neo4j record
  // ==================================================

  mapRiskRecord(record) {

    return {

      riskId:
        record.get(
          "riskId"
        ),

      disasterRoute:
        record.get(
          "disasterRoute"
        ),

      riskType:
        record.get(
          "riskType"
        ),

      severity:
        record.get(
          "severity"
        ),

      primaryFactor:
        record.get(
          "primaryFactor"
        ),

      season:
        record.get(
          "season"
        ),

      historicalOccurrenceCount:
        toNativeNumber(
          record.get(
            "historicalOccurrenceCount"
          )
        ),

      recommendation:
        record.get(
          "recommendation"
        ),

      matchType:
        record.get(
          "matchType"
        ),

    };
  }


  // ==================================================
  // Build graph-based safety reasoning
  //
  // NOTE:
  // This does NOT repeat or modify ML predictions.
  // ML prediction and graph evidence are independent.
  // ==================================================

  async getSafetyReasoning(
    routeName
  ) {

    const graphResult =
      await this.getRouteRisks(
        routeName
      );


    const risks =
      graphResult.matchedRisks;


    if (
      graphResult.matchType ===
      "unavailable"
    ) {
      return {
        source:
          "Neo4j Knowledge Graph-based Safety Reasoning",

        status:
          "unavailable",

        routeCode:
          graphResult.routeCode,

        matchType:
          "unavailable",

        riskCount:
          0,

        matchedRisks:
          [],

        explanation:
          "Historical safety evidence is temporarily unavailable.",
      };
    }


    if (
      risks.length === 0
    ) {
      return {
        source:
          "Neo4j Knowledge Graph-based Safety Reasoning",

        status:
          "available",

        routeCode:
          graphResult.routeCode,

        matchedRoute:
          graphResult.matchedRoute,

        matchType:
          "no-match",

        riskCount:
          0,

        matchedRisks:
          [],

        explanation:
          "No matched historical hazard record was found for this route in the current knowledge graph.",
      };
    }


    // ------------------------------------------------
    // Identify most relevant historical evidence
    // ------------------------------------------------

    const severityRank = {
      critical: 5,
      "very high": 4,
      high: 3,
      medium: 2,
      moderate: 2,
      low: 1,
    };


    const sortedRisks =
      [...risks].sort(
        (a, b) => {

          const severityA =
            severityRank[
              normalize(
                a.severity
              ).toLowerCase()
            ] || 0;

          const severityB =
            severityRank[
              normalize(
                b.severity
              ).toLowerCase()
            ] || 0;


          if (
            severityB !==
            severityA
          ) {
            return (
              severityB -
              severityA
            );
          }


          return (
            (
              b.historicalOccurrenceCount ||
              0
            )
            -
            (
              a.historicalOccurrenceCount ||
              0
            )
          );
        }
      );


    const primaryRisk =
      sortedRisks[0];


    const explanationParts = [];


    explanationParts.push(
      `${risks.length} historical hazard record(s) were retrieved for route ${graphResult.routeCode}.`
    );


    explanationParts.push(
      `The highest-priority retrieved hazard is ${primaryRisk.riskType || "an identified road hazard"} with ${primaryRisk.severity || "unknown"} severity.`
    );


    if (
      primaryRisk.primaryFactor
    ) {
      explanationParts.push(
        `Primary historical factor: ${primaryRisk.primaryFactor}.`
      );
    }


    if (
      primaryRisk
        .historicalOccurrenceCount !==
        null
    ) {
      explanationParts.push(
        `Historical occurrence count: ${primaryRisk.historicalOccurrenceCount}.`
      );
    }


    if (
      primaryRisk.season
    ) {
      explanationParts.push(
        `Reported high-risk season: ${primaryRisk.season}.`
      );
    }


    if (
      primaryRisk.recommendation
    ) {
      explanationParts.push(
        `Safety advice: ${primaryRisk.recommendation}`
      );
    }


    return {

      source:
        "Neo4j Knowledge Graph-based Safety Reasoning",

      status:
        "available",

      routeCode:
        graphResult.routeCode,

      matchedRoute:
        graphResult.matchedRoute,

      matchType:
        graphResult.matchType,

      riskCount:
        risks.length,

      matchedRisks:
        risks,

      primaryRisk,

      explanation:
        explanationParts.join(
          " "
        ),

    };
  }


  // ==================================================
  // Get one context object suitable for ML inference
  //
  // This does NOT perform prediction.
  // It only supplies graph evidence.
  // ==================================================

  async getMLRiskContext(
    routeName
  ) {

    const graphResult =
      await this.getRouteRisks(
        routeName
      );


    if (
      graphResult.matchedRisks.length ===
      0
    ) {
      return {
        routeCode:
          graphResult.routeCode,

        matchType:
          graphResult.matchType,

        hazardType:
          "Unknown",

        riskFactor:
          "Unknown",

        season:
          "Unknown",

        historicalOccurrenceCount:
          null,
      };
    }


    const risks =
      [...graphResult.matchedRisks];


    risks.sort(
      (a, b) =>
        (
          b.historicalOccurrenceCount ||
          0
        )
        -
        (
          a.historicalOccurrenceCount ||
          0
        )
    );


    const selected =
      risks[0];


    return {

      routeCode:
        graphResult.routeCode,

      matchType:
        graphResult.matchType,

      hazardType:
        selected.riskType ||
        "Unknown",

      riskFactor:
        selected.primaryFactor ||
        "Unknown",

      season:
        selected.season ||
        "Unknown",

      historicalOccurrenceCount:
        selected
          .historicalOccurrenceCount,

    };
  }
}


module.exports =
  new GraphManager();
