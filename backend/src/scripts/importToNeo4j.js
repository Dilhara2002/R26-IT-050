const fs = require("fs");
const path = require("path");
const readline = require("readline");
const crypto = require("crypto");
const { driver } = require("../config/neo4j");


// ==================================================
// Configuration
// ==================================================

const DATA_DIR = path.join(
  __dirname,
  "../ai-engine/data"
);

const ROAD_PATH = path.join(
  DATA_DIR,
  "Road Dataset.csv"
);

const DISASTER_PATH = path.join(
  DATA_DIR,
  "Disaster Dataset.csv"
);

const VEHICLE_PATH = path.join(
  DATA_DIR,
  "vehicles.csv"
);

const SOURCE_TAG = "safety-analyzer-v2";


// ==================================================
// General helpers
// ==================================================

const cleanText = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/"/g, "")
    .trim();
};


const toNumberOrNull = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(
    String(value)
      .replace(/,/g, "")
      .replace(/%/g, "")
      .trim()
  );

  return Number.isFinite(number)
    ? number
    : null;
};


const stableHash = (value) => {
  return crypto
    .createHash("sha1")
    .update(String(value))
    .digest("hex")
    .slice(0, 16);
};


const extractRouteCode = (value) => {
  const text = cleanText(value);

  const match = text.match(
    /^(A\d+|B-\w+|B\d+|E\d+)/i
  );

  if (!match) {
    return "UNKNOWN";
  }

  return match[1].toUpperCase();
};


const makeRouteKey = (routeCode) => {
  return cleanText(routeCode)
    .toLowerCase();
};


const extractSegmentNumber = (value) => {
  const match = String(value || "").match(
    /Segment\s+(\d+)/i
  );

  if (!match) {
    return null;
  }

  return Number(match[1]);
};


const extractKmRange = (value) => {
  const text = String(value || "");

  const rangeMatch = text.match(
    /KM\s*(\d+)\s*-\s*(\d+)/i
  );

  if (rangeMatch) {
    return {
      start: Number(rangeMatch[1]),
      end: Number(rangeMatch[2]),
    };
  }

  const singleMatch = text.match(
    /KM\s*(\d+)/i
  );

  if (singleMatch) {
    const start = Number(singleMatch[1]);

    return {
      start,
      end: start,
    };
  }

  return {
    start: null,
    end: null,
  };
};


// ==================================================
// CSV parser
// ==================================================

const parseCsvLine = (line) => {
  const values = [];

  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];

      // Escaped quote inside quoted field
      if (insideQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (
      char === "," &&
      !insideQuotes
    ) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
};


const loadCsvRows = async (filePath) => {
  const stream = fs.createReadStream(
    filePath
  );

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const rows = [];

  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }

    const values = parseCsvLine(line);

    if (!headers) {
      headers = values.map(cleanText);
      continue;
    }

    rows.push({
      values,
      rawLine: line,
    });
  }

  return {
    headers,
    rows,
  };
};


// ==================================================
// Standard row conversion
// ==================================================

const rowToObject = (
  headers,
  values
) => {
  const row = {};

  headers.forEach(
    (header, index) => {
      row[header] =
        values[index] !== undefined
          ? cleanText(values[index])
          : "";
    }
  );

  return row;
};


// ==================================================
// Disaster dataset repair
// ==================================================

const normalizeDisasterRow = (
  headers,
  rawValues
) => {
  let values = [...rawValues];

  /*
    Expected meaningful columns:

    0 Route Name
    1 Disaster/Risk Type
    2 Severity Level
    3 Primary Risk Factor
    4 Month/Season of High Risk
    5 Historical Occurrence Count
    6 Safety Recommendation

    Some E01/E02/E03 Aquaplaning rows are malformed:

    season becomes two CSV fields:
    May-Jul
    Oct-Dec

    Then:
    occurrence count shifts to index 6
    recommendation shifts to index 7
  */

  const possibleOccurrence =
    toNumberOrNull(values[5]);

  const shiftedOccurrence =
    toNumberOrNull(values[6]);

  let repaired = false;


  if (
    possibleOccurrence === null &&
    shiftedOccurrence !== null &&
    values.length >= 8
  ) {
    const seasonPart1 =
      cleanText(values[4]);

    const seasonPart2 =
      cleanText(values[5]);

    const combinedSeason = [
      seasonPart1,
      seasonPart2,
    ]
      .filter(Boolean)
      .join(" / ");

    values = [
      values[0],
      values[1],
      values[2],
      values[3],
      combinedSeason,
      values[6],
      values[7],
    ];

    repaired = true;
  }


  // Ignore trailing empty field in source CSV
  if (
    values.length > 7 &&
    cleanText(
      values[values.length - 1]
    ) === ""
  ) {
    values = values.slice(
      0,
      values.length - 1
    );
  }


  const row = rowToObject(
    headers,
    values
  );


  return {
    row,
    repaired,
  };
};


// ==================================================
// Load road records
// ==================================================

const loadRoadRecords = async () => {
  const {
    headers,
    rows,
  } = await loadCsvRows(
    ROAD_PATH
  );

  return rows.map(
    ({ values }) => {
      const row = rowToObject(
        headers,
        values
      );

      const routeName =
        row["Route/Segment Name"];

      const routeCode =
        extractRouteCode(
          routeName
        );

      const routeKey =
        makeRouteKey(
          routeCode
        );

      const segmentNumber =
        extractSegmentNumber(
          routeName
        );

      const segmentKey =
        segmentNumber !== null
          ? `${routeKey}-segment-${segmentNumber}`
          : `${routeKey}-${stableHash(routeName)}`;


      return {
        routeCode,
        routeKey,
        segmentKey,
        segmentNumber,
        routeName,

        gradient:
          toNumberOrNull(
            row["Max Gradient (%)"]
          ),

        terrain:
          cleanText(
            row["Terrain Type"]
          ) || "Unknown",

        roadSurface:
          cleanText(
            row["Road Surface Condition"]
          ) || "Unknown",

        elevation:
          toNumberOrNull(
            row["Average Elevation"]
          ),

        friction:
          toNumberOrNull(
            row["Surface Friction Index"]
          ),

        roadWidth:
          cleanText(
            row["Typical Road Width"]
          ) || "Unknown",
      };
    }
  );
};


// ==================================================
// Load disaster records
// ==================================================

const loadDisasterRecords = async () => {
  const {
    headers,
    rows,
  } = await loadCsvRows(
    DISASTER_PATH
  );

  const disasters = [];

  let repairedCount = 0;


  rows.forEach(
    ({ values }, index) => {
      const {
        row,
        repaired,
      } = normalizeDisasterRow(
        headers,
        values
      );

      if (repaired) {
        repairedCount += 1;
      }


      const routeName =
        cleanText(
          row["Route Name"]
        );

      const routeCode =
        extractRouteCode(
          routeName
        );

      const routeKey =
        makeRouteKey(
          routeCode
        );

      const {
        start: kmStart,
        end: kmEnd,
      } = extractKmRange(
        routeName
      );


      const riskType =
        cleanText(
          row["Disaster/Risk Type"]
        ) || "Unknown Risk";

      const severity =
        cleanText(
          row["Severity Level"]
        ) || "Unknown";

      const primaryFactor =
        cleanText(
          row["Primary Risk Factor"]
        ) || "Unknown";

      const season =
        cleanText(
          row[
            "Month/Season of High Risk"
          ]
        ) || "Unknown";

      const historicalOccurrenceCount =
        toNumberOrNull(
          row[
            "Historical Occurrence Count"
          ]
        );

      const recommendation =
        cleanText(
          row[
            "Safety Recommendation"
          ]
        ) || "Travel carefully";


      const riskId = stableHash(
        [
          routeName,
          riskType,
          severity,
          primaryFactor,
          season,
          index,
        ].join("|")
      );


      disasters.push({
        riskId,
        routeCode,
        routeKey,
        routeName,
        kmStart,
        kmEnd,
        riskType,
        severity,
        primaryFactor,
        season,
        historicalOccurrenceCount,
        recommendation,
        sourceRepaired: repaired,
      });
    }
  );


  return {
    disasters,
    repairedCount,
  };
};


// ==================================================
// Load vehicle records
// ==================================================

const loadVehicleRecords = async () => {
  const {
    headers,
    rows,
  } = await loadCsvRows(
    VEHICLE_PATH
  );


  return rows.map(
    ({ values }) => {
      const row = rowToObject(
        headers,
        values
      );

      const model =
        cleanText(
          row[
            "Vehicle Name (Make & Model)"
          ]
        ) || "Unknown Vehicle";

      const vehicleId =
        stableHash(model);


      return {
        vehicleId,
        model,

        category:
          cleanText(
            row[
              "Vehicle Category"
            ]
          ) || "Unknown",

        fuelType:
          cleanText(
            row[
              "Fuel Type"
            ]
          ) || "Unknown",

        seating:
          toNumberOrNull(
            row[
              "Seating Capacity"
            ]
          ),

        gradeability:
          toNumberOrNull(
            row[
              "Gradeability (%)"
            ]
          ),

        torque:
          toNumberOrNull(
            row[
              "Max Torque (Nm)"
            ]
          ),

        engineCapacity:
          toNumberOrNull(
            row[
              "Engine Capacity (CC)"
            ]
          ),

        fuelEfficiency:
          toNumberOrNull(
            row[
              "Fuel Efficiency (km/L)"
            ]
          ),

        baseHireCharge:
          toNumberOrNull(
            row[
              "BaseHireCharge"
            ]
          ),

        rentalPricePerKM:
          toNumberOrNull(
            row[
              "RentalPricePerKM"
            ]
          ),
      };
    }
  );
};


// ==================================================
// Neo4j constraints
// ==================================================

const createConstraints = async (
  session
) => {
  console.log(
    "🔒 Creating uniqueness constraints..."
  );


  await session.run(`
    CREATE CONSTRAINT route_key_unique
    IF NOT EXISTS
    FOR (r:Route)
    REQUIRE r.routeKey IS UNIQUE
  `);


  await session.run(`
    CREATE CONSTRAINT segment_key_unique
    IF NOT EXISTS
    FOR (s:RoadSegment)
    REQUIRE s.segmentKey IS UNIQUE
  `);


  await session.run(`
    CREATE CONSTRAINT risk_id_unique
    IF NOT EXISTS
    FOR (d:DisasterRisk)
    REQUIRE d.riskId IS UNIQUE
  `);


  await session.run(`
    CREATE CONSTRAINT vehicle_id_unique
    IF NOT EXISTS
    FOR (v:Vehicle)
    REQUIRE v.vehicleId IS UNIQUE
  `);
};


// ==================================================
// Import Routes + Road Segments
// ==================================================

const importRoads = async (
  session,
  roads
) => {
  console.log(
    `🛣 Importing ${roads.length} road segments...`
  );


  for (const road of roads) {
    await session.run(
      `
      MERGE (r:Route {
        routeKey: $routeKey
      })

      SET
        r.routeCode = $routeCode,
        r.sourceTag = $sourceTag

      MERGE (s:RoadSegment {
        segmentKey: $segmentKey
      })

      SET
        s.routeCode = $routeCode,
        s.routeKey = $routeKey,
        s.routeName = $routeName,
        s.segmentNumber = $segmentNumber,
        s.gradient = $gradient,
        s.terrain = $terrain,
        s.roadSurface = $roadSurface,
        s.elevation = $elevation,
        s.friction = $friction,
        s.roadWidth = $roadWidth,
        s.sourceTag = $sourceTag

      MERGE (r)-[:HAS_SEGMENT]->(s)
      `,
      {
        ...road,
        sourceTag: SOURCE_TAG,
      }
    );
  }
};


// ==================================================
// Import Disaster Risks
// ==================================================

const importDisasters = async (
  session,
  disasters,
  roadLookup
) => {
  console.log(
    `⚠️ Importing ${disasters.length} disaster risks...`
  );


  let exactCount = 0;
  let routeLevelCount = 0;
  let noRoadDataCount = 0;


  for (const disaster of disasters) {
    const routeRoads =
      roadLookup.get(
        disaster.routeCode
      ) || [];


    let matchType =
      "no-road-data";

    let matchedSegmentKey =
      null;


    if (
      disaster.kmStart !== null &&
      routeRoads.length > 0
    ) {
      const exactRoad =
        routeRoads.find(
          (road) =>
            road.segmentNumber ===
            disaster.kmStart
        );


      if (exactRoad) {
        matchType = "exact";

        matchedSegmentKey =
          exactRoad.segmentKey;

        exactCount += 1;
      } else {
        matchType =
          "route-level";

        routeLevelCount += 1;
      }
    } else if (
      routeRoads.length > 0
    ) {
      matchType =
        "route-level";

      routeLevelCount += 1;
    } else {
      noRoadDataCount += 1;
    }


    await session.run(
      `
      MERGE (r:Route {
        routeKey: $routeKey
      })

      SET
        r.routeCode = $routeCode,
        r.sourceTag = $sourceTag

      MERGE (d:DisasterRisk {
        riskId: $riskId
      })

      SET
        d.routeCode = $routeCode,
        d.routeKey = $routeKey,
        d.routeName = $routeName,
        d.kmStart = $kmStart,
        d.kmEnd = $kmEnd,
        d.riskType = $riskType,
        d.severity = $severity,
        d.primaryFactor = $primaryFactor,
        d.season = $season,
        d.historicalOccurrenceCount =
          $historicalOccurrenceCount,
        d.recommendation =
          $recommendation,
        d.matchType = $matchType,
        d.sourceRepaired =
          $sourceRepaired,
        d.sourceTag = $sourceTag

      MERGE (r)-[rel:HAS_RISK]->(d)

      SET
        rel.matchType = $matchType,
        rel.sourceTag = $sourceTag
      `,
      {
        ...disaster,
        matchType,
        sourceTag: SOURCE_TAG,
      }
    );


    // Exact road segment evidence only.
    // We intentionally do not guess a segment
    // when only route-level evidence exists.
    if (matchedSegmentKey) {
      await session.run(
        `
        MATCH (s:RoadSegment {
          segmentKey: $segmentKey
        })

        MATCH (d:DisasterRisk {
          riskId: $riskId
        })

        MERGE (s)-[rel:HAS_HAZARD]->(d)

        SET
          rel.matchType = "exact",
          rel.sourceTag = $sourceTag
        `,
        {
          segmentKey:
            matchedSegmentKey,

          riskId:
            disaster.riskId,

          sourceTag:
            SOURCE_TAG,
        }
      );
    }
  }


  return {
    exactCount,
    routeLevelCount,
    noRoadDataCount,
  };
};


// ==================================================
// Import vehicles
// ==================================================

const importVehicles = async (
  session,
  vehicles
) => {
  console.log(
    `🚗 Importing ${vehicles.length} vehicles...`
  );


  for (const vehicle of vehicles) {
    await session.run(
      `
      MERGE (v:Vehicle {
        vehicleId: $vehicleId
      })

      SET
        v.model = $model,
        v.category = $category,
        v.fuelType = $fuelType,
        v.seating = $seating,
        v.gradeability = $gradeability,
        v.torque = $torque,
        v.engineCapacity =
          $engineCapacity,
        v.fuelEfficiency =
          $fuelEfficiency,
        v.baseHireCharge =
          $baseHireCharge,
        v.rentalPricePerKM =
          $rentalPricePerKM,
        v.sourceTag = $sourceTag
      `,
      {
        ...vehicle,
        sourceTag: SOURCE_TAG,
      }
    );
  }
};


// ==================================================
// Main
// ==================================================

const importKnowledgeGraph = async () => {
  const session = driver.session();


  try {
    console.log(
      "🚀 Starting Neo4j Knowledge Graph v2 import..."
    );


    const roads =
      await loadRoadRecords();


    const {
      disasters,
      repairedCount,
    } =
      await loadDisasterRecords();


    const vehicles =
      await loadVehicleRecords();


    console.log(
      `✅ Roads loaded: ${roads.length}`
    );

    console.log(
      `✅ Disaster records loaded: ${disasters.length}`
    );

    console.log(
      `✅ Malformed disaster rows repaired: ${repairedCount}`
    );

    console.log(
      `✅ Vehicles loaded: ${vehicles.length}`
    );


    const invalidOccurrenceCount =
      disasters.filter(
        (risk) =>
          risk.historicalOccurrenceCount ===
          null
      ).length;


    console.log(
      `✅ Invalid occurrence counts remaining: ${invalidOccurrenceCount}`
    );


    if (
      invalidOccurrenceCount > 0
    ) {
      throw new Error(
        "Disaster dataset still contains invalid historical occurrence counts."
      );
    }


    await createConstraints(
      session
    );


    await importRoads(
      session,
      roads
    );


    const roadLookup =
      new Map();


    for (const road of roads) {
      if (
        !roadLookup.has(
          road.routeCode
        )
      ) {
        roadLookup.set(
          road.routeCode,
          []
        );
      }

      roadLookup
        .get(
          road.routeCode
        )
        .push(
          road
        );
    }


    const matchSummary =
      await importDisasters(
        session,
        disasters,
        roadLookup
      );


    await importVehicles(
      session,
      vehicles
    );


    console.log(
      "\n================================"
    );

    console.log(
      "✅ NEO4J IMPORT COMPLETE"
    );

    console.log(
      "================================"
    );

    console.log(
      `Exact segment matches: ${matchSummary.exactCount}`
    );

    console.log(
      `Route-level matches: ${matchSummary.routeLevelCount}`
    );

    console.log(
      `No-road-data risks: ${matchSummary.noRoadDataCount}`
    );

    console.log(
      `Source rows repaired: ${repairedCount}`
    );

    console.log(
      "No full graph deletion was performed."
    );

    console.log(
      "================================"
    );

  } catch (error) {
    console.error(
      "❌ Neo4j Import Error:",
      error
    );

    process.exitCode = 1;

  } finally {
    await session.close();
    await driver.close();
  }
};


importKnowledgeGraph();