const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { driver } = require("../config/neo4j");

const splitCsvLine = (line) => {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let char of line) {
    if (char === '"') insideQuotes = !insideQuotes;
    else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }

  result.push(current.trim());
  return result.map((item) => item.replace(/^"|"$/g, "").trim());
};

const loadCsvData = async (filePath) => {
  const rows = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let headers = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const values = splitCsvLine(line);

    if (headers.length === 0) headers = values;
    else {
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
    console.log("🚀 Starting Neo4j Graph Import...");

    const roadPath = path.join(__dirname, "../ai-engine/data/Road Dataset.csv");
    const disasterPath = path.join(__dirname, "../ai-engine/data/Disaster Dataset.csv");
    const vehiclePath = path.join(__dirname, "../ai-engine/data/vehicles.csv");

    const roads = await loadCsvData(roadPath);
    const disasters = await loadCsvData(disasterPath);
    const vehicles = await loadCsvData(vehiclePath);

    console.log(`✅ Roads Loaded: ${roads.length}`);
    console.log(`✅ Disasters Loaded: ${disasters.length}`);
    console.log(`✅ Vehicles Loaded: ${vehicles.length}`);

    console.log("🧹 Clearing old graph...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("🛣 Creating Road Nodes...");
    for (const road of roads) {
      await session.run(
        `
        CREATE (:Road {
          routeName: $routeName,
          gradient: $gradient,
          terrain: $terrain,
          surface: $surface
        })
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
        CREATE (:DisasterRisk {
          routeName: $routeName,
          riskType: $riskType,
          severity: $severity,
          primaryFactor: $primaryFactor,
          recommendation: $recommendation
        })
        `,
        {
          routeName: disaster["Route Name"] || "Unknown Route",
          riskType: disaster["Disaster/Risk Type"] || "Unknown Risk",
          severity: disaster["Severity Level"] || "Unknown",
          primaryFactor: disaster["Primary Risk Factor"] || "Unknown",
          recommendation: disaster["Safety Recommendation"] || "Travel carefully",
        }
      );
    }

    console.log("🚗 Creating Vehicle Nodes...");
    for (const vehicle of vehicles) {
      await session.run(
        `
        CREATE (:Vehicle {
          model: $model,
          category: $category,
          fuelType: $fuelType,
          seating: $seating,
          gradeability: $gradeability,
          torque: $torque
        })
        `,
        {
          model: vehicle["Vehicle Name (Make & Model)"] || "Unknown Vehicle",
          category: vehicle["Vehicle Category"] || "Unknown",
          fuelType: vehicle["Fuel Type"] || "Unknown",
          seating: Number(vehicle["Seating Capacity"] || 0),
          gradeability: Number(vehicle["Gradeability (%)"] || 0),
          torque: Number(vehicle["Max Torque (Nm)"] || 0),
        }
      );
    }

    console.log("🔗 Creating Road → Risk relationships...");
    await session.run(`
      MATCH (r:Road), (d:DisasterRisk)
      WHERE toLower(r.routeName) CONTAINS toLower(d.routeName)
         OR toLower(d.routeName) CONTAINS toLower(r.routeName)
      MERGE (r)-[:HAS_RISK]->(d)
    `);

    console.log("✅ Neo4j Knowledge Graph Imported Successfully!");
  } catch (error) {
    console.error("❌ Neo4j Import Error:", error.message);
  } finally {
    await session.close();
    await driver.close();
  }
};

importKnowledgeGraph();
