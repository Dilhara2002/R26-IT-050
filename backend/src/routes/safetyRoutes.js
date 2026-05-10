const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const { spawn } = require("child_process");

const { getRouteDetails } = require("../services/routeService");
const graphManager = require("../ai-engine/knowledge-graph/graphManager");
const { getWeatherByCoordinates } = require("../services/weatherService");

// ---------- Helpers ----------
const normalize = (str) =>
  str ? str.toString().toLowerCase().replace(/\s+/g, "").trim() : "";

const toNumber = (value, fallback = 0) => {
  const num = Number(String(value || "").replace("%", "").replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : fallback;
};

const getField = (row, possibleNames, fallback = "") => {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return fallback;
};

// ---------- CSV Splitter ----------
const splitCsvLine = (line) => {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

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
  const rows = [];

  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath);

  const rl = readline.createInterface({
    input: fileStream,
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

// ---------- Road Matching ----------
const getRoadData = async (startLocation, endLocation) => {
  const roadPath = path.join(__dirname, "../ai-engine/data/Road Dataset.csv");
  const roads = await loadCsvData(roadPath);

  const generatedRouteName = `${startLocation}-${endLocation}`;
  const normalizedInput = normalize(generatedRouteName);

  let matchedRoads = roads.filter((road) => {
    const routeName = road["Route/Segment Name"] || "";
    const normalizedRoute = normalize(routeName);

    return (
      normalizedRoute.includes(normalizedInput) ||
      normalizedInput.includes(normalizedRoute)
    );
  });

  if (matchedRoads.length === 0) {
    const inputParts = [startLocation, endLocation]
      .filter(Boolean)
      .map((item) => item.toLowerCase().trim());

    matchedRoads = roads.filter((road) => {
      const routeName = (road["Route/Segment Name"] || "").toLowerCase();
      return inputParts.some((part) => routeName.includes(part));
    });
  }

  if (matchedRoads.length === 0) {
    return roads[0] || null;
  }

  matchedRoads.sort(
    (a, b) => toNumber(b["Max Gradient (%)"]) - toNumber(a["Max Gradient (%)"])
  );

  return matchedRoads[0];
};

// ---------- New Dataset Pricing ----------
const calculateHirePrice = (vehicle, distanceKm) => {
  const baseHireCharge = toNumber(
    getField(vehicle, ["BaseHireCharge", "Base Hire Charge", "Base_Hire_Charge"])
  );

  const rentalPricePerKM = toNumber(
    getField(vehicle, ["RentalPricePerKM", "Rental Price Per KM", "Rental_Price_Per_KM"])
  );

  if (baseHireCharge <= 0 || rentalPricePerKM <= 0) {
    return 999999999;
  }

  return Math.round(baseHireCharge + distanceKm * rentalPricePerKM);
};

// ---------- Old Fallback Cost Calculation ----------
const calculateTrueCost = (distance, efficiency, fuelType) => {
  const fuelPrice = fuelType === "Diesel" ? 341 : 371;
  const driverFeePerKm = 60;
  const profitMargin = 1.25;

  const fuelEfficiency = toNumber(efficiency);

  if (!fuelEfficiency || fuelEfficiency <= 0) {
    return 999999;
  }

  const fuelCost = (distance / fuelEfficiency) * fuelPrice;
  const baseCost = fuelCost + distance * driverFeePerKm;

  return Math.round(baseCost * profitMargin);
};

// ---------- Surface Encoding ----------
const getSurfaceValue = (surfaceText) => {
  const surface = (surfaceText || "").toLowerCase();

  if (surface.includes("excellent")) return 1;
  if (surface.includes("good")) return 1;
  if (surface.includes("fair")) return 2;
  if (surface.includes("poor")) return 3;
  if (surface.includes("bad")) return 4;

  return 1;
};

// ---------- Real ML Prediction ----------
const getBatchMLSafetyScores = (vehicles, road, isRaining) => {
  return new Promise((resolve, reject) => {
    const batchInput = vehicles.map((vehicle) => ({
      cc: toNumber(
        getField(vehicle, ["Engine Capacity (CC)", "Engine_CC", "Engine Capacity"])
      ),
      torque: toNumber(
        getField(vehicle, ["Max Torque (Nm)", "Torque_Nm", "Max Torque"])
      ),
      gradeability: toNumber(
        getField(vehicle, ["Gradeability (%)", "Gradeability_Percent", "Gradeability"])
      ),
      gradient: toNumber(road["Max Gradient (%)"]),
      surface: getSurfaceValue(road["Road Surface Condition"]),
    }));

    const scriptPath = path.join(
      __dirname,
      "../ai-engine/scripts/predict_safety.py"
    );

    const pythonProcess = spawn("python3", [
      scriptPath,
      JSON.stringify(batchInput),
    ]);

    let output = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Batch ML prediction failed: ${errorOutput}`));
      }

      try {
        let scores = JSON.parse(output.trim());

        scores = scores.map((score) => {
          let finalScore = Number(score);

          if (isRaining) {
            finalScore *= 0.85;
          }

          finalScore = Math.max(5, Math.min(100, finalScore));

          return Number(finalScore.toFixed(2));
        });

        resolve(scores);
      } catch (err) {
        reject(new Error(`Failed to parse ML predictions: ${output}`));
      }
    });
  });
};

// ---------- Main API ----------
router.post("/recommend-vehicle", async (req, res) => {
  try {
    const {
      budget,
      passengers,
      startLocation,
      endLocation,
      preferredVehicle,
    } = req.body;

    if (!budget || !passengers || !startLocation || !endLocation) {
      return res.status(400).json({
        success: false,
        message:
          "budget, passengers, startLocation and endLocation are required.",
      });
    }

    const userBudget = Number(budget);
    const passengerCount = Number(passengers);

    const routeDetails = await getRouteDetails(startLocation, endLocation);
    const distanceKm = Number(routeDetails.distanceKm);

    if (!distanceKm || distanceKm <= 0) {
      return res.status(400).json({
        success: false,
        message: "Could not calculate a valid distance for this route.",
      });
    }

    const weatherInfo = await getWeatherByCoordinates(
      routeDetails.startCoordinates.latitude,
      routeDetails.startCoordinates.longitude
    );

    const isRaining = weatherInfo.isRaining;

    const roadInfo = await getRoadData(startLocation, endLocation);

    if (!roadInfo) {
      return res.status(404).json({
        success: false,
        message: `No road data found for ${startLocation} to ${endLocation}.`,
      });
    }

    const vehiclePath = path.join(__dirname, "../ai-engine/data/vehicles.csv");
    const vehicles = await loadCsvData(vehiclePath);

    const mlScores = await getBatchMLSafetyScores(vehicles, roadInfo, isRaining);
    const analyzedVehicles = [];

    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i];
      const safetyScore = mlScores[i];

      const baseHireCharge = toNumber(
        getField(vehicle, ["BaseHireCharge", "Base Hire Charge", "Base_Hire_Charge"])
      );

      const rentalPricePerKM = toNumber(
        getField(vehicle, ["RentalPricePerKM", "Rental Price Per KM", "Rental_Price_Per_KM"])
      );

      const estimatedHirePrice = calculateHirePrice(vehicle, distanceKm);

      const fallbackCalculatedCost = calculateTrueCost(
        distanceKm,
        getField(vehicle, ["Fuel Efficiency (km/L)", "Fuel_Efficiency_kmpl"]),
        getField(vehicle, ["Fuel Type", "Fuel_Type"])
      );

      analyzedVehicles.push({
        ...vehicle,
        safetyScore,
        baseHireCharge,
        rentalPricePerKM,
        estimatedHirePrice,
        calculatedCost: estimatedHirePrice,
        fallbackCalculatedCost,
        priceFormula: "BaseHireCharge + (DistanceKM × RentalPricePerKM)",
        predictionType: "Real ML Batch Inference",
      });
    }

    const recommended = analyzedVehicles
      .filter((vehicle) => {
        const vehiclePrice = Number(vehicle.estimatedHirePrice);

        const matchesBudget = vehiclePrice <= userBudget;

        const seatingCapacity = toNumber(
          getField(vehicle, ["Seating Capacity", "MaxPassengers", "Max Passengers"])
        );

        const matchesPassengers = seatingCapacity >= passengerCount;

        const vehicleCategory = getField(vehicle, [
          "Vehicle Category",
          "VehicleCategory",
          "Category",
        ]);

        const matchesPreferredVehicle = preferredVehicle
          ? vehicleCategory.toLowerCase().includes(preferredVehicle.toLowerCase())
          : true;

        return matchesBudget && matchesPassengers && matchesPreferredVehicle;
      })
      .sort((a, b) => {
        if (b.safetyScore !== a.safetyScore) {
          return b.safetyScore - a.safetyScore;
        }

        return a.estimatedHirePrice - b.estimatedHirePrice;
      });

    const bestVehicle = recommended[0] || null;

    const graphReasoning = bestVehicle
      ? await graphManager.getSafetyReasoning(
          roadInfo["Route/Segment Name"],
          bestVehicle.safetyScore,
          isRaining
        )
      : null;

    const safetyUpsell =
      analyzedVehicles
        .filter(
          (vehicle) =>
            vehicle.estimatedHirePrice > userBudget &&
            vehicle.estimatedHirePrice <= userBudget * 1.3 &&
            vehicle.safetyScore > (bestVehicle?.safetyScore || 0)
        )
        .sort((a, b) => {
          if (b.safetyScore !== a.safetyScore) {
            return b.safetyScore - a.safetyScore;
          }

          return a.estimatedHirePrice - b.estimatedHirePrice;
        })[0] || null;

    return res.json({
      success: true,
      message:
        recommended.length === 0
          ? "No vehicle found within your budget. Please increase the budget or remove preferredVehicle."
          : "Vehicle recommendation generated successfully using Real ML Inference + GraphRAG reasoning + dataset pricing.",
      systemType: "Real ML Inference + GraphRAG Reasoning + Pricing Filter",
      trip: {
        from: startLocation,
        to: endLocation,
        distanceKm: routeDetails.distanceKm,
        durationMinutes: routeDetails.durationMinutes,
      },
      analysis: {
        matchedRoad: roadInfo["Route/Segment Name"],
        gradient: `${roadInfo["Max Gradient (%)"]}%`,
        terrain: roadInfo["Terrain Type"],
        roadSurface: roadInfo["Road Surface Condition"],
        averageElevation: roadInfo["Average Elevation (m)"] || null,
        surfaceFrictionIndex: roadInfo["Surface Friction Index"] || null,
        typicalRoadWidth: roadInfo["Typical Road Width (m)"] || null,
        weather: weatherInfo.weatherDescription,
        temperature: weatherInfo.temperature,
        weatherLocation: weatherInfo.locationName,
        rainDetected: isRaining,
        predictionSource: "Python Random Forest ML Model",
        pricingSource: "Vehicle dataset BaseHireCharge + RentalPricePerKM",
      },
      graphRAG: graphReasoning,
      bestSafetyMatch: bestVehicle,
      alternativeOptions: recommended.slice(1, 3),
      safetyUpsell,
      totalVehiclesAnalyzed: analyzedVehicles.length,
      totalVehiclesWithinBudget: recommended.length,
    });
  } catch (error) {
    console.error("Safety Route Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
});

module.exports = router;