import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

import graphManager from "../ai-engine/knowledge-graph/graphManager.js";
import {
  getRouteAlternatives,
  getRouteAlternativesByCoordinates,
} from "./routeService.js";
import { getWeatherByCoordinates } from "./weatherService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIRECTORY = path.join(__dirname, "../ai-engine/data");
const RISK_ORDER = { Low: 0, Medium: 1, High: 2 };

const normalize = (value) => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const toNullableNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace("%", "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
};

const getField = (row, names, fallback = "") => {
  for (const name of names) {
    if (row?.[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return fallback;
};

const splitCsvLine = (line) => {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
};

const csvCache = new Map();
const loadCsv = async (filename) => {
  if (csvCache.has(filename)) return csvCache.get(filename);
  const content = await fs.readFile(path.join(DATA_DIRECTORY, filename), "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift());
  const rows = lines.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
  csvCache.set(filename, rows);
  return rows;
};

const getRouteFamilyName = (routeName) => String(routeName || "")
  .replace(/\s*[-–—]?\s*segment\s*(?:no\.?\s*)?\d+\s*$/i, "")
  .replace(/\s+/g, " ")
  .trim();

const meaningfulTokens = (value) => {
  const ignored = new Set(["to", "from", "road", "route", "segment", "the", "and"]);
  return normalize(value).split(" ").filter((token) => token.length >= 3 && !ignored.has(token));
};

const aggregateRoadRows = (name, rows, extra = {}) => {
  const numbers = (field) => rows.map((row) => toNullableNumber(row[field]))
    .filter((value) => value !== null);
  const mode = (field) => {
    const counts = new Map();
    rows.map((row) => String(row[field] || "").trim()).filter(Boolean)
      .forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
  };
  const average = (field, places) => {
    const values = numbers(field);
    return values.length
      ? Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(places))
      : null;
  };
  const gradients = numbers("Max Gradient (%)");
  return {
    ...rows[0],
    "Route/Segment Name": name,
    "Max Gradient (%)": gradients.length ? Math.max(...gradients) : null,
    "Average Elevation": average("Average Elevation", 2),
    "Surface Friction Index": average("Surface Friction Index", 3),
    "Terrain Type": mode("Terrain Type"),
    "Road Surface Condition": mode("Road Surface Condition"),
    "Typical Road Width": mode("Typical Road Width"),
    _aggregationType: "route-family",
    _segmentCount: rows.length,
    _matchedRouteFamily: name,
    ...extra,
  };
};

const getRoadDataByRouteLabels = async (routeLabels = []) => {
  const labels = routeLabels.map(normalize).filter(Boolean);
  if (!labels.length) return null;
  const roads = await loadCsv("processed_roads.csv");
  const families = new Map();
  for (const road of roads) {
    const family = getRouteFamilyName(road["Route/Segment Name"]);
    const normalizedFamily = normalize(family);
    const code = normalizedFamily.split(" ")[0];
    const tokens = meaningfulTokens(family);
    const matched = labels.filter((label) =>
      (code && /^[ab]\d+$/i.test(code) && new RegExp(`(^| )${code}( |$)`, "i").test(label)) ||
      tokens.filter((token) => label.includes(token)).length >= 2
    );
    if (!matched.length) continue;
    if (!families.has(normalizedFamily)) {
      families.set(normalizedFamily, { name: family, rows: [], labels: new Set() });
    }
    const entry = families.get(normalizedFamily);
    entry.rows.push(road);
    matched.forEach((label) => entry.labels.add(label));
  }
  const selected = [...families.values()].sort((a, b) =>
    b.labels.size - a.labels.size || b.rows.length - a.rows.length || a.name.localeCompare(b.name)
  )[0];
  return selected
    ? aggregateRoadRows(selected.name, selected.rows, {
      _matchedLabelCount: selected.labels.size,
      _routeLabelCount: labels.length,
    })
    : null;
};

const getRoadDataByNames = async (startName, endName) => {
  if (typeof startName !== "string" || typeof endName !== "string") return null;
  const roads = await loadCsv("processed_roads.csv");
  const startTokens = meaningfulTokens(startName);
  const endTokens = meaningfulTokens(endName);
  const matches = roads.map((road) => {
    const family = getRouteFamilyName(road["Route/Segment Name"]);
    const route = normalize(family);
    const score = [...startTokens, ...endTokens]
      .reduce((total, token) => total + (route.includes(token) ? 2 : 0), 0);
    return { road, family, score };
  }).filter((entry) => entry.score > 0);
  if (!matches.length) return null;
  const highest = Math.max(...matches.map((entry) => entry.score));
  const best = matches.filter((entry) => entry.score === highest);
  const grouped = new Map();
  best.forEach(({ road, family }) => {
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(road);
  });
  const [family, rows] = [...grouped].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  return aggregateRoadRows(family, rows);
};

const buildMlInput = (roadInfo, graphContext) => ({
  gradient: toNullableNumber(roadInfo?.["Max Gradient (%)"]),
  elevation: toNullableNumber(roadInfo?.["Average Elevation"]),
  friction: toNullableNumber(roadInfo?.["Surface Friction Index"]),
  historical_occurrence_count: graphContext?.historicalOccurrenceCount ?? null,
  road_data_available: roadInfo ? 1 : 0,
  terrain: roadInfo?.["Terrain Type"] || "Unknown",
  road_surface: roadInfo?.["Road Surface Condition"] || "Unknown",
  road_width: roadInfo?.["Typical Road Width"] || "Unknown",
  hazard_type: graphContext?.hazardType || "Unknown",
  season: graphContext?.season || "Unknown",
});

const runRiskPrediction = (input) => new Promise((resolve, reject) => {
  const pythonBinary = process.env.PYTHON_BIN ||
    path.join(__dirname, "../../.venv/bin/python");
  const script = path.join(__dirname, "../ai-engine/scripts/predict_safety.py");
  const child = spawn(pythonBinary, [script, JSON.stringify(input)]);
  let output = "";
  let errorOutput = "";
  let settled = false;
  const finishError = () => {
    if (settled) return;
    settled = true;
    const error = new Error("Risk prediction is unavailable.");
    error.code = "ML_UNAVAILABLE";
    reject(error);
  };
  const timer = setTimeout(() => {
    child.kill();
    finishError();
  }, Number(process.env.ML_PREDICTION_TIMEOUT_MS || 15000));
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { errorOutput += data; });
  child.on("error", finishError);
  child.on("close", (code) => {
    clearTimeout(timer);
    if (settled) return;
    if (code !== 0) return finishError(errorOutput);
    try {
      const result = JSON.parse(output.trim());
      if (!result.success || !RISK_ORDER.hasOwnProperty(result.riskLevel)) return finishError();
      settled = true;
      resolve(result);
    } catch {
      finishError();
    }
  });
});

const validateGeometry = (geometry, from, to) => {
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) {
    return null;
  }
  const valid = geometry.coordinates.every((coordinate) =>
    Array.isArray(coordinate) && coordinate.length >= 2 &&
    Number.isFinite(coordinate[0]) && coordinate[0] >= -180 && coordinate[0] <= 180 &&
    Number.isFinite(coordinate[1]) && coordinate[1] >= -90 && coordinate[1] <= 90
  );
  if (!valid) return null;
  const first = geometry.coordinates[0];
  const last = geometry.coordinates[geometry.coordinates.length - 1];
  const endpointOrderIsValid =
    Math.abs(first[0] - from.lon) <= 0.5 &&
    Math.abs(first[1] - from.lat) <= 0.5 &&
    Math.abs(last[0] - to.lon) <= 0.5 &&
    Math.abs(last[1] - to.lat) <= 0.5;
  return endpointOrderIsValid ? geometry : null;
};

const compareRoutes = (first, second) =>
  (RISK_ORDER[first.riskPrediction.riskLevel] - RISK_ORDER[second.riskPrediction.riskLevel]) ||
  Number(first.riskPrediction.probabilities?.High || 0) - Number(second.riskPrediction.probabilities?.High || 0) ||
  Number(first.riskPrediction.probabilities?.Medium || 0) - Number(second.riskPrediction.probabilities?.Medium || 0) ||
  first.route.durationMinutes - second.route.durationMinutes ||
  first.route.distanceKm - second.route.distanceKm ||
  String(first.route.routeId).localeCompare(String(second.route.routeId));

const getUnavailableWeather = () => ({ status: "unavailable" });

const recommendVehicle = async ({ distanceKm, maxGradient, riskLevel, budget, passengers, preferredCategory }) => {
  if (![distanceKm, maxGradient].every(Number.isFinite) || !RISK_ORDER.hasOwnProperty(riskLevel)) {
    return { status: "unavailable", reason: "Complete distance, gradient, and risk evidence is required." };
  }
  const vehicles = await loadCsv("processed_vehicles.csv");
  const candidates = vehicles.map((vehicle) => {
    const base = toNullableNumber(vehicle.BaseHireCharge);
    const perKm = toNullableNumber(vehicle.RentalPricePerKM);
    const gradeability = toNullableNumber(vehicle["Gradeability (%)"]);
    const seatingCapacity = toNullableNumber(vehicle["Seating Capacity"]);
    const estimatedHirePrice = base !== null && perKm !== null
      ? Math.round(base + distanceKm * perKm)
      : null;
    const pricing = {
      status: estimatedHirePrice === null ? "unavailable" : "dataset-baseline",
      currency: "LKR",
      distanceKm: Number(distanceKm.toFixed(2)),
      baseCharge: base,
      ratePerKm: perKm,
      totalCost: estimatedHirePrice,
      formula: "BaseHireCharge + (DistanceKM × RentalPricePerKM)",
      source: "Vehicle research dataset",
      sourceVerifiedAt: null,
      isLiveMarketRate: false,
      requiresAdminVerification: true,
      limitation: "The model-level rate is an internal dataset baseline until an administrator verifies and dates it against a rental-provider source.",
    };
    return {
      vehicleName: vehicle["Vehicle Name (Make & Model)"],
      vehicleCategory: vehicle["Vehicle Category"],
      fuelType: vehicle["Fuel Type"] || "Unknown",
      seatingCapacity,
      estimatedHirePrice,
      calculatedCost: estimatedHirePrice,
      pricing,
      priceFormula: pricing.formula,
      maxTorqueNm: toNullableNumber(vehicle["Max Torque (Nm)"]),
      engineCapacityCc: toNullableNumber(vehicle["Engine Capacity (CC)"]),
      vehicleSuitability: {
        gradeability,
        roadGradient: maxGradient,
        gradeabilityMargin: gradeability === null ? null : Number((gradeability - maxGradient).toFixed(2)),
        gradientDataAvailable: true,
        suitableForGradient: gradeability === null ? null : gradeability >= maxGradient,
        gradientSuitability: gradeability === null
          ? "unknown"
          : gradeability >= maxGradient ? "suitable" : "unsuitable",
      },
    };
  }).filter((vehicle) =>
    vehicle.estimatedHirePrice !== null && vehicle.estimatedHirePrice <= budget &&
    vehicle.seatingCapacity >= passengers &&
    vehicle.vehicleSuitability.gradeability >= maxGradient &&
    (!preferredCategory || normalize(vehicle.vehicleCategory).includes(normalize(preferredCategory)))
  ).sort((first, second) => {
    if (riskLevel === "Low") return first.estimatedHirePrice - second.estimatedHirePrice;
    return second.vehicleSuitability.gradeabilityMargin - first.vehicleSuitability.gradeabilityMargin ||
      second.maxTorqueNm - first.maxTorqueNm || first.estimatedHirePrice - second.estimatedHirePrice;
  });
  return {
    status: candidates.length ? "available" : "no_match",
    reason: candidates.length ? null : "No vehicle met the whole-trip budget, capacity, category, and gradient requirements.",
    bestVehicle: candidates[0] || null,
    alternativeOptions: candidates.slice(1, 3),
    calculationScope: "whole-trip-once",
    distanceKm,
    maxGradient,
    riskLevel,
  };
};

const defaultDependencies = {
  getRouteAlternatives,
  getRouteAlternativesByCoordinates,
  getRoadDataByRouteLabels,
  getRoadDataByNames,
  getWeatherByCoordinates,
  graphManager,
  runRiskPrediction,
  recommendVehicle,
};
let dependencies = { ...defaultDependencies };

const setSafetyAnalysisDependenciesForTesting = (overrides = {}) => {
  dependencies = { ...dependencies, ...overrides };
};
const resetSafetyAnalysisDependenciesForTesting = () => {
  dependencies = { ...defaultDependencies };
};

const analyzeSafetyLeg = async ({ legSequence, from, to, routeAlternatives = null }) => {
  const routes = routeAlternatives ||
    await dependencies.getRouteAlternativesByCoordinates(from, to);
  if (!Array.isArray(routes) || !routes.length) {
    const error = new Error("No route alternatives were returned.");
    error.code = "ROUTE_NOT_FOUND";
    throw error;
  }

  const evaluated = [];
  const usedFamilies = new Set();
  for (const route of routes) {
    let roadInfo = null;
    try {
      roadInfo = await dependencies.getRoadDataByRouteLabels(route.roadNames || []);
    } catch {
      roadInfo = null;
    }
    const family = roadInfo?._matchedRouteFamily;
    if (!roadInfo || !family || usedFamilies.has(normalize(family))) continue;
    usedFamilies.add(normalize(family));
    let graphContext = { status: "unavailable" };
    try {
      graphContext = await dependencies.graphManager.getMLRiskContext(family) || graphContext;
    } catch {
      // Neo4j is optional enrichment.
    }
    try {
      const riskPrediction = await dependencies.runRiskPrediction(buildMlInput(roadInfo, graphContext));
      if (RISK_ORDER.hasOwnProperty(riskPrediction?.riskLevel)) {
        evaluated.push({ route, roadInfo, graphContext, riskPrediction });
      }
    } catch {
      // A route remains usable even when risk inference is unavailable.
    }
  }

  let selected = evaluated.sort(compareRoutes)[0] || null;
  let selectedRouteMode = evaluated.length >= 2 ? "lower-risk-recommended" : "default-analyzed-route";
  const defaultRoute = routes[0];
  if (!selected) {
    let roadInfo = null;
    try {
      roadInfo = await dependencies.getRoadDataByNames(from.name, to.name);
    } catch {
      roadInfo = null;
    }
    if (roadInfo) {
      const family = roadInfo._matchedRouteFamily || roadInfo["Route/Segment Name"];
      let graphContext = { status: "unavailable" };
      try {
        graphContext = await dependencies.graphManager.getMLRiskContext(family) || graphContext;
      } catch {
        // Neo4j is optional enrichment.
      }
      try {
        const riskPrediction = await dependencies.runRiskPrediction(buildMlInput(roadInfo, graphContext));
        if (RISK_ORDER.hasOwnProperty(riskPrediction?.riskLevel)) {
          selected = { route: defaultRoute, roadInfo, graphContext, riskPrediction };
        }
      } catch {
        selected = { route: defaultRoute, roadInfo, graphContext, riskPrediction: null };
      }
    }
  }

  const chosenRoute = selected?.route || defaultRoute;
  if (!Number.isFinite(Number(chosenRoute.distanceKm)) || Number(chosenRoute.distanceKm) <= 0 ||
      !Number.isFinite(Number(chosenRoute.durationMinutes)) || Number(chosenRoute.durationMinutes) < 0) {
    const error = new Error("The selected route did not contain valid distance and duration evidence.");
    error.code = "ROUTE_SERVICE_ERROR";
    throw error;
  }
  const limitations = [];
  const routeGeometry = validateGeometry(chosenRoute.geometry, from, to);
  if (!routeGeometry) limitations.push("Valid GeoJSON route geometry was unavailable.");
  if (!selected?.riskPrediction) limitations.push("Valid route risk evidence was unavailable.");

  let weather = getUnavailableWeather();
  try {
    weather = await dependencies.getWeatherByCoordinates(from.lat, from.lon) || weather;
  } catch {
    // Weather is optional enrichment.
  }
  let graphContext = selected?.graphContext || { status: "unavailable" };
  if (selected?.roadInfo) {
    try {
      const reasoning = await dependencies.graphManager.getSafetyReasoning(
        selected.roadInfo._matchedRouteFamily || selected.roadInfo["Route/Segment Name"]
      );
      graphContext = { ...graphContext, reasoning: reasoning ? { ...reasoning, error: undefined } : null };
    } catch {
      // Neo4j reasoning is optional enrichment.
    }
  }

  return {
    leg_sequence: legSequence,
    from,
    to,
    status: "success",
    distance_km: Number(chosenRoute.distanceKm),
    duration_minutes: Number(chosenRoute.durationMinutes),
    route_geometry: routeGeometry,
    selected_route_mode: selectedRouteMode,
    risk_prediction: selected?.riskPrediction || null,
    weather,
    graph_context: graphContext,
    risk_evidence_available: Boolean(selected?.riskPrediction),
    max_gradient: toNullableNumber(selected?.roadInfo?.["Max Gradient (%)"]),
    terrain: selected?.roadInfo?.["Terrain Type"] || "Unknown",
    road_surface: selected?.roadInfo?.["Road Surface Condition"] || "Unknown",
    limitations,
    error: null,
  };
};

const getWholeTripVehicleRecommendation = (context) =>
  dependencies.recommendVehicle(context);

const analyzeNamedSafetyRoute = async ({ startLocation, endLocation }) => {
  const routes = await dependencies.getRouteAlternatives(startLocation, endLocation);
  const first = routes?.[0];
  if (!first?.startCoordinates || !first?.endCoordinates) {
    const error = new Error("Resolved route coordinates were unavailable.");
    error.code = "ROUTE_SERVICE_ERROR";
    throw error;
  }
  return analyzeSafetyLeg({
    legSequence: 1,
    from: {
      name: first.correctedStartLocation || startLocation,
      lat: first.startCoordinates.latitude,
      lon: first.startCoordinates.longitude,
    },
    to: {
      name: first.correctedEndLocation || endLocation,
      lat: first.endCoordinates.latitude,
      lon: first.endCoordinates.longitude,
    },
    routeAlternatives: routes,
  });
};

export {
  RISK_ORDER,
  analyzeSafetyLeg,
  analyzeNamedSafetyRoute,
  getWholeTripVehicleRecommendation,
  setSafetyAnalysisDependenciesForTesting,
  resetSafetyAnalysisDependenciesForTesting,
};
