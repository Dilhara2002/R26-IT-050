const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { driver } = require("../config/neo4j");

const splitCsvLine = (line) => {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (const char of line) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result.map((item) => item.replace(/^"|"$/g, "").trim());
};

const loadCsvData = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const rows = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let headers = [];

  for await (const line of rl) {
    if (!line.trim()) continue;

    const values = splitCsvLine(line);

    if (headers.length === 0) {
      headers = values;
    } else {
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      rows.push(row);
    }
  }

  return rows;
};

const importKnowledgeGraph = async () => {
  const session = driver.session();

  try {
    console.log("🚀 Starting Neo4j GraphRAG Knowledge Import...");

    const roadPath = path.join(
      __dirname,
      "../ai-engine/data/processed_roads.csv"
    );

    const disasterPath = path.join(
      __dirname,
      "../ai-engine/data/processed_disasters.csv"
    );

    const roads = await loadCsvData(roadPath);
    const disasters = await loadCsvData(disasterPath);

    console.log(`✅ Roads Loaded: ${roads.length}`);
    console.log(`✅ Disasters Loaded: ${disasters.length}`);

    console.log("🧹 Clearing old Neo4j graph...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("🛣 Creating Road Nodes...");

    for (const road of roads) {
      await session.run(
        `
        MERGE (r:Road { routeName: $routeName })
        SET
          r.gradient = $gradient,
          r.terrain = $terrain,
          r.surface = $surface
        `,
        {
          routeName: road["Route/Segment Name"] || "Unknown Route",
          gradient: Number(road["Max Gradient (%)"] || 0),
          terrain: road["Terrain Type"] || "Unknown",
          surface: road["Road Surface Condition"] || "Unknown",
        }
      );
    }

    console.log("⚠️ Creating Disaster Risk Nodes...");

    for (const disaster of disasters) {
      await session.run(
        `
        MERGE (d:DisasterRisk {
          routeName: $routeName,
          riskType: $riskType
        })
        SET
          d.severity = $severity,
          d.primaryFactor = $primaryFactor,
          d.recommendation = $recommendation
        `,
        {
          routeName: disaster["Route Name"] || "Unknown Route",
          riskType: disaster["Disaster/Risk Type"] || "Unknown Risk",
          severity: disaster["Severity Level"] || "Unknown",
          primaryFactor:
            disaster["Primary Risk Factor"] || "Unknown Risk Factor",
          recommendation:
            disaster["Safety Recommendation"] || "Travel carefully",
        }
      );
    }

    console.log("🔗 Creating Road → DisasterRisk relationships...");

    await session.run(`
      MATCH (r:Road), (d:DisasterRisk)
      WHERE toLower(r.routeName) CONTAINS toLower(d.routeName)
         OR toLower(d.routeName) CONTAINS toLower(r.routeName)
      MERGE (r)-[:HAS_RISK]->(d)
    `);

    console.log("✅ Neo4j GraphRAG Knowledge Graph Imported Successfully!");
  } catch (error) {
    console.error("❌ Neo4j Import Error:", error.message);
  } finally {
    await session.close();
    await driver.close();
  }
};

importKnowledgeGraph();