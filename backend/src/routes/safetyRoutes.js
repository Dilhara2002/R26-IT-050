const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");

const {
  getRouteDetails,
} = require("../services/routeService");

const {
  getWeatherByCoordinates,
} = require("../services/weatherService");

const graphManager = require(
  "../ai-engine/knowledge-graph/graphManager"
);


// ==================================================
// Helpers
// ==================================================

const normalize = (value) =>
  value
    ? String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";


const toNumber = (
  value,
  fallback = 0
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(
    String(value)
      .replace("%", "")
      .replace(/,/g, "")
      .trim()
  );

  return Number.isFinite(number)
    ? number
    : fallback;
};


const toNullableNumber = (
  value
) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(
    String(value)
      .replace("%", "")
      .replace(/,/g, "")
      .trim()
  );

  return Number.isFinite(number)
    ? number
    : null;
};


const getField = (
  row,
  possibleNames,
  fallback = ""
) => {
  for (const name of possibleNames) {
    if (
      row[name] !== undefined &&
      row[name] !== null &&
      row[name] !== ""
    ) {
      return row[name];
    }
  }

  return fallback;
};


// ==================================================
// CSV parser
// ==================================================

const splitCsvLine = (
  line
) => {
  const result = [];

  let current = "";
  let insideQuotes = false;


  for (
    let i = 0;
    i < line.length;
    i += 1
  ) {
    const char = line[i];


    if (char === '"') {

      const next =
        line[i + 1];


      if (
        insideQuotes &&
        next === '"'
      ) {
        current += '"';
        i += 1;
      } else {
        insideQuotes =
          !insideQuotes;
      }

      continue;
    }


    if (
      char === "," &&
      !insideQuotes
    ) {
      result.push(
        current.trim()
      );

      current = "";

      continue;
    }


    current += char;
  }


  result.push(
    current.trim()
  );


  return result;
};


const loadCsvData = async (
  filePath
) => {

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    throw new Error(
      `CSV file not found: ${filePath}`
    );
  }


  const rows = [];


  const rl =
    readline.createInterface({
      input:
        fs.createReadStream(
          filePath
        ),

      crlfDelay:
        Infinity,
    });


  let headers = null;


  for await (
    const line of rl
  ) {

    if (
      !line.trim()
    ) {
      continue;
    }


    const values =
      splitCsvLine(
        line
      );


    if (!headers) {

      headers =
        values.map(
          (value) =>
            String(value)
              .replace(/^"|"$/g, "")
              .trim()
        );

      continue;
    }


    const row = {};


    headers.forEach(
      (
        header,
        index
      ) => {

        row[header] =
          values[index] !==
          undefined
            ? String(
                values[index]
              )
                .replace(
                  /^"|"$/g,
                  ""
                )
                .trim()
            : "";

      }
    );


    rows.push(
      row
    );
  }


  return rows;
};


// ==================================================
// Road matching
// ==================================================

const getMeaningfulTokens = (
  text
) => {

  const ignored = new Set([
    "to",
    "from",
    "road",
    "route",
    "segment",
    "the",
    "and",
  ]);


  return normalize(text)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        !ignored.has(
          token
        )
    );
};


const calculateRouteMatchScore = (
  routeName,
  startLocation,
  endLocation
) => {

  const normalizedRoute =
    normalize(
      routeName
    );


  const startTokens =
    getMeaningfulTokens(
      startLocation
    );


  const endTokens =
    getMeaningfulTokens(
      endLocation
    );


  let score = 0;


  for (
    const token
    of startTokens
  ) {
    if (
      normalizedRoute.includes(
        token
      )
    ) {
      score += 2;
    }
  }


  for (
    const token
    of endTokens
  ) {
    if (
      normalizedRoute.includes(
        token
      )
    ) {
      score += 2;
    }
  }


  const combined =
    normalize(
      `${startLocation} ${endLocation}`
    );


  if (
    normalizedRoute.includes(
      combined
    )
  ) {
    score += 5;
  }


  return score;
};


const getRouteFamilyName = (
  routeName
) =>
  String(routeName || "")
    .replace(
      /\s*[-–—]?\s*segment\s*(?:no\.?\s*)?\d+\s*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();


const getDeterministicMode = (
  values
) => {

  const counts = new Map();


  values
    .map(
      (value) =>
        String(value || "").trim()
    )
    .filter(Boolean)
    .forEach(
      (value) => {
        counts.set(
          value,
          (counts.get(value) || 0) + 1
        );
      }
    );


  if (counts.size === 0) {
    return "";
  }


  return [...counts.entries()]
    .sort(
      ([firstValue, firstCount], [secondValue, secondCount]) => {
        if (secondCount !== firstCount) {
          return secondCount - firstCount;
        }

        return firstValue.localeCompare(secondValue);
      }
    )[0][0];
};


const getRoundedAverage = (
  values,
  decimalPlaces
) => {

  const numbers =
    values
      .map(toNullableNumber)
      .filter(
        (value) => value !== null
      );


  if (numbers.length === 0) {
    return null;
  }


  const average =
    numbers.reduce(
      (total, value) => total + value,
      0
    ) / numbers.length;


  return Number(
    average.toFixed(decimalPlaces)
  );
};


const getRoadData = async (
  startLocation,
  endLocation
) => {

  const roadPath =
    path.join(
      __dirname,
      "../ai-engine/data/processed_roads.csv"
    );


  const roads =
    await loadCsvData(
      roadPath
    );


  const scored =
    roads
      .map(
        (road) => {

          const routeName =
            getField(
              road,
              [
                "Route/Segment Name",
              ]
            );


          return {
            road,

            score:
              calculateRouteMatchScore(
                routeName,
                startLocation,
                endLocation
              ),
          };
        }
      )
      .filter(
        (item) =>
          item.score > 0
      );


  if (
    scored.length === 0
  ) {
    return null;
  }


  const highestScore =
    Math.max(
      ...scored.map(
        (item) => item.score
      )
    );


  const bestMatches =
    scored.filter(
      (item) =>
        item.score ===
        highestScore
    );


  const routeFamilies = new Map();


  bestMatches.forEach(
    (item) => {
      const routeName =
        getField(
          item.road,
          [
            "Route/Segment Name",
          ]
        );

      const routeFamily =
        getRouteFamilyName(
          routeName
        );

      const routeFamilyKey =
        normalize(routeFamily);


      if (!routeFamilies.has(routeFamilyKey)) {
        routeFamilies.set(
          routeFamilyKey,
          {
            name: routeFamily,
            rows: [],
          }
        );
      }


      routeFamilies
        .get(routeFamilyKey)
        .rows.push(item.road);
    }
  );


  const selectedRouteFamily =
    [...routeFamilies.values()]
      .sort(
        (first, second) => {
          if (
            second.rows.length !==
            first.rows.length
          ) {
            return (
              second.rows.length -
              first.rows.length
            );
          }

          return first.name.localeCompare(
            second.name
          );
        }
      )[0];


  const segments =
    selectedRouteFamily.rows;


  const gradients =
    segments
      .map(
        (road) =>
          toNullableNumber(
            getField(
              road,
              [
                "Max Gradient (%)",
              ]
            )
          )
      )
      .filter(
        (value) => value !== null
      );


  return {
    ...segments[0],
    "Route/Segment Name":
      selectedRouteFamily.name,
    "Max Gradient (%)":
      gradients.length > 0
        ? Math.max(...gradients)
        : null,
    "Average Elevation":
      getRoundedAverage(
        segments.map(
          (road) =>
            getField(
              road,
              [
                "Average Elevation",
              ]
            )
        ),
        2
      ),
    "Surface Friction Index":
      getRoundedAverage(
        segments.map(
          (road) =>
            getField(
              road,
              [
                "Surface Friction Index",
              ]
            )
        ),
        3
      ),
    "Terrain Type":
      getDeterministicMode(
        segments.map(
          (road) =>
            getField(
              road,
              [
                "Terrain Type",
              ]
            )
        )
      ),
    "Road Surface Condition":
      getDeterministicMode(
        segments.map(
          (road) =>
            getField(
              road,
              [
                "Road Surface Condition",
              ]
            )
        )
      ),
    "Typical Road Width":
      getDeterministicMode(
        segments.map(
          (road) =>
            getField(
              road,
              [
                "Typical Road Width",
              ]
            )
        )
      ),
    _aggregationType:
      "route-family",
    _segmentCount:
      segments.length,
    _matchedRouteFamily:
      selectedRouteFamily.name,
  };
};


// ==================================================
// Vehicle pricing / suitability
// ==================================================

const calculateHirePrice = (
  vehicle,
  distanceKm
) => {

  const baseHireCharge =
    toNumber(
      getField(
        vehicle,
        [
          "BaseHireCharge",
          "Base Hire Charge",
          "Base_Hire_Charge",
        ]
      )
    );


  const rentalPricePerKM =
    toNumber(
      getField(
        vehicle,
        [
          "RentalPricePerKM",
          "Rental Price Per KM",
          "Rental_Price_Per_KM",
        ]
      )
    );


  if (
    baseHireCharge <= 0 ||
    rentalPricePerKM <= 0
  ) {
    return null;
  }


  return Math.round(
    baseHireCharge +
    distanceKm *
      rentalPricePerKM
  );
};


const calculateVehicleSuitability = (
  vehicle,
  roadGradient
) => {

  const gradeability =
    toNumber(
      getField(
        vehicle,
        [
          "Gradeability (%)",
          "Gradeability_Percent",
          "Gradeability",
        ]
      )
    );


  const gradientDataAvailable =
    roadGradient !== null;


  const margin =
    gradientDataAvailable
      ? gradeability -
        roadGradient
      : null;


  return {

    gradeability,

    roadGradient,

    gradientDataAvailable,

    gradeabilityMargin:
      margin !== null
        ? Number(
            margin.toFixed(2)
          )
        : null,

    suitableForGradient:
      gradientDataAvailable
        ? gradeability >=
          roadGradient
        : null,

    gradientSuitability:
      gradientDataAvailable
        ? (
            gradeability >=
            roadGradient
              ? "suitable"
              : "unsuitable"
          )
        : "unknown",

  };
};


const getVehicleTorque = (
  vehicle
) =>
  toNumber(
    getField(
      vehicle,
      [
        "Max Torque (Nm)",
      ]
    )
  );


const getVehicleEngineCapacity = (
  vehicle
) =>
  toNumber(
    getField(
      vehicle,
      [
        "Engine Capacity (CC)",
      ]
    )
  );


const compareVehiclesByRisk = (
  first,
  second,
  riskLevel
) => {

  const normalizedRiskLevel =
    String(riskLevel || "")
      .toLowerCase()
      .trim();

  const firstMargin =
    toNumber(
      first.vehicleSuitability
        ?.gradeabilityMargin
    );

  const secondMargin =
    toNumber(
      second.vehicleSuitability
        ?.gradeabilityMargin
    );

  const firstTorque =
    getVehicleTorque(first);

  const secondTorque =
    getVehicleTorque(second);

  const firstEngineCapacity =
    getVehicleEngineCapacity(first);

  const secondEngineCapacity =
    getVehicleEngineCapacity(second);

  const firstPrice =
    toNumber(
      first.estimatedHirePrice
    );

  const secondPrice =
    toNumber(
      second.estimatedHirePrice
    );

  const comparePrice = () =>
    firstPrice - secondPrice;

  const compareMargin = () =>
    secondMargin - firstMargin;

  const compareTorque = () =>
    secondTorque - firstTorque;

  const compareEngineCapacity = () =>
    secondEngineCapacity -
    firstEngineCapacity;


  if (normalizedRiskLevel === "low") {
    return (
      comparePrice() ||
      compareMargin()
    );
  }


  if (normalizedRiskLevel === "high") {
    return (
      compareMargin() ||
      compareTorque() ||
      compareEngineCapacity() ||
      comparePrice()
    );
  }


  return (
    compareMargin() ||
    compareTorque() ||
    comparePrice()
  );
};


// ==================================================
// Python ML inference
// ==================================================

const runRiskPrediction = (
  mlInput
) => {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const scriptPath =
        path.join(
          __dirname,
          "../ai-engine/scripts/predict_safety.py"
        );


      // Can be overridden in .env:
      // PYTHON_BIN=/path/to/python
      const pythonBinary =
        process.env.PYTHON_BIN ||
        path.join(
          __dirname,
          "../../.venv/bin/python"
        );


      const pythonProcess =
        spawn(
          pythonBinary,
          [
            scriptPath,
            JSON.stringify(
              mlInput
            ),
          ]
        );


      let output = "";

      let errorOutput = "";

      let settled = false;


      const rejectMlUnavailable = (
        message
      ) => {

        if (settled) {
          return;
        }

        settled = true;

        const error = new Error(
          message
        );

        error.code = "ML_UNAVAILABLE";

        reject(error);
      };


      pythonProcess.stdout.on(
        "data",
        (data) => {
          output +=
            data.toString();
        }
      );


      pythonProcess.stderr.on(
        "data",
        (data) => {
          errorOutput +=
            data.toString();
        }
      );


      pythonProcess.on(
        "error",
        (error) => {

          rejectMlUnavailable(
            `Could not start Python ML process: ${error.message}`
          );

        }
      );


      pythonProcess.on(
        "close",
        (code) => {

          if (settled) {
            return;
          }

          if (
            code !== 0
          ) {
            return rejectMlUnavailable(
              `ML prediction failed: ${
                errorOutput ||
                output
              }`
            );
          }


          try {

            const result =
              JSON.parse(
                output.trim()
              );


            if (
              !result.success
            ) {
              return rejectMlUnavailable(
                result.error ||
                "ML prediction returned an error."
              );
            }


            settled = true;

            resolve(
              result
            );

          } catch (error) {

            rejectMlUnavailable(
              `Failed to parse ML output: ${output}`
            );

          }

        }
      );

    }
  );
};


// ==================================================
// Build ML input
// ==================================================

const buildMLInput = (
  roadInfo,
  graphContext
) => {

  const gradient =
    toNullableNumber(
      getField(
        roadInfo,
        [
          "Max Gradient (%)",
        ]
      )
    );


  const elevation =
    toNullableNumber(
      getField(
        roadInfo,
        [
          "Average Elevation",
          "Average Elevation (m)",
        ]
      )
    );


  const friction =
    toNullableNumber(
      getField(
        roadInfo,
        [
          "Surface Friction Index",
        ]
      )
    );


  const terrain =
    getField(
      roadInfo,
      [
        "Terrain Type",
      ],
      "Unknown"
    );


  const roadSurface =
    getField(
      roadInfo,
      [
        "Road Surface Condition",
      ],
      "Unknown"
    );


  const roadWidth =
    getField(
      roadInfo,
      [
        "Typical Road Width",
        "Typical Road Width (m)",
      ],
      "Unknown"
    );


  return {

    gradient,

    elevation,

    friction,

    historical_occurrence_count:
      graphContext
        ?.historicalOccurrenceCount ??
      null,

    road_data_available:
      gradient !== null ||
      elevation !== null ||
      friction !== null
        ? 1
        : 0,

    terrain:
      terrain ||
      "Unknown",

    road_surface:
      roadSurface ||
      "Unknown",

    road_width:
      roadWidth ||
      "Unknown",

    hazard_type:
      graphContext
        ?.hazardType ||
      "Unknown",

    season:
      graphContext
        ?.season ||
      "Unknown",

  };
};


// ==================================================
// Main API
// ==================================================

router.post(
  "/recommend-vehicle",
  async (
    req,
    res
  ) => {

    try {

      const {
        budget,
        passengers,
        startLocation,
        endLocation,
        preferredCategory,
        preferredVehicle,
      } = req.body;


      const requestedVehicleCategory =
        preferredCategory ||
        preferredVehicle ||
        "";


      // ------------------------------------------------
      // Request validation
      // ------------------------------------------------

      if (
        budget === undefined ||
        passengers === undefined ||
        !startLocation ||
        !endLocation
      ) {

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "budget, passengers, startLocation and endLocation are required.",
          });

      }


      const userBudget =
        Number(
          budget
        );


      const passengerCount =
        Number(
          passengers
        );


      if (
        !Number.isFinite(
          userBudget
        ) ||
        userBudget <= 0
      ) {

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "budget must be a positive number.",
          });

      }


      if (
        !Number.isFinite(
          passengerCount
        ) ||
        passengerCount <= 0
      ) {

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "passengers must be a positive number.",
          });

      }


      // ------------------------------------------------
      // Route service
      // ------------------------------------------------

      const routeDetails =
        await getRouteDetails(
          startLocation,
          endLocation
        );


      const distanceKm =
        Number(
          routeDetails.distanceKm
        );


      if (
        !Number.isFinite(
          distanceKm
        ) ||
        distanceKm <= 0
      ) {

        return res
          .status(400)
          .json({
            success:
              false,

            message:
              "Could not calculate a valid distance for this route.",
          });

      }


      // ------------------------------------------------
      // Weather
      //
      // Weather is context only.
      // It does NOT arbitrarily modify the ML score.
      // ------------------------------------------------

      const weatherInfo =
        await getWeatherByCoordinates(
          routeDetails
            .startCoordinates
            .latitude,

          routeDetails
            .startCoordinates
            .longitude
        );


      const isRaining =
        Boolean(
          weatherInfo
            ?.isRaining
        );


      // ------------------------------------------------
      // Road dataset
      // ------------------------------------------------

      const roadInfo =
        await getRoadData(
          startLocation,
          endLocation
        );


      if (
        !roadInfo
      ) {

        return res
          .status(404)
          .json({
            success:
              false,

            message:
              `No supported road dataset match was found for ${startLocation} to ${endLocation}.`,
          });

      }


      const matchedRoadName =
        getField(
          roadInfo,
          [
            "Route/Segment Name",
          ]
        );


      // ------------------------------------------------
      // Neo4j graph context
      // ------------------------------------------------

      let graphContext = {
        status: "unavailable",
        records: [],
        risks: [],
        message:
          "Neo4j graph context is currently unavailable.",
      };


      let graphReasoning = {
        status: "unavailable",
        message:
          "Neo4j safety reasoning is currently unavailable.",
        explanation: null,
        risks: [],
        records: [],
      };


      try {

        const [
          fetchedGraphContext,
          fetchedGraphReasoning,
        ] = await Promise.all([
          graphManager.getMLRiskContext(
            matchedRoadName
          ),
          graphManager.getSafetyReasoning(
            matchedRoadName
          ),
        ]);


        if (fetchedGraphContext) {
          graphContext = fetchedGraphContext;
        }


        if (fetchedGraphReasoning) {
          graphReasoning = fetchedGraphReasoning;
        }

      } catch (error) {

        console.error(
          "Neo4j graph lookup failed. Continuing without graph context:",
          error.message
        );

      }


      // ------------------------------------------------
      // ONE route-level ML prediction
      // ------------------------------------------------

      const mlInput =
        buildMLInput(
          roadInfo,
          graphContext
        );


      let riskPrediction;


      try {

        riskPrediction =
          await runRiskPrediction(
            mlInput
          );

      } catch (error) {

        if (
          error.code ===
          "ML_UNAVAILABLE"
        ) {

          console.error(
            "ML prediction unavailable:",
            error.message
          );

          return res.status(503).json({
            success: false,
            error: true,
            code: "ML_UNAVAILABLE",
            message:
              "The route risk prediction service is temporarily unavailable. Please try again.",
          });

        }

        throw error;

      }


      // ------------------------------------------------
      // Vehicle dataset
      // ------------------------------------------------

      const vehiclePath =
        path.join(
          __dirname,
          "../ai-engine/data/processed_vehicles.csv"
        );


      const vehicles =
        await loadCsvData(
          vehiclePath
        );


      const roadGradient =
        toNullableNumber(
          getField(
            roadInfo,
            [
              "Max Gradient (%)",
            ]
          )
        );


      const analyzedVehicles =
        vehicles.map(
          (vehicle) => {

            const estimatedHirePrice =
              calculateHirePrice(
                vehicle,
                distanceKm
              );


            const suitability =
              calculateVehicleSuitability(
                vehicle,
                roadGradient
              );


            const seatingCapacity =
              toNumber(
                getField(
                  vehicle,
                  [
                    "Seating Capacity",
                    "MaxPassengers",
                    "Max Passengers",
                  ]
                )
              );


            const vehicleCategory =
              getField(
                vehicle,
                [
                  "Vehicle Category",
                  "VehicleCategory",
                  "Category",
                ],
                "Unknown"
              );


            return {

              ...vehicle,

              estimatedHirePrice,

              calculatedCost:
                estimatedHirePrice,

              seatingCapacity,

              vehicleCategory,

              vehicleSuitability:
                suitability,

              priceFormula:
                "BaseHireCharge + (DistanceKM × RentalPricePerKM)",

              recommendationType:
                "Rule-based vehicle suitability + dataset pricing",

            };

          }
        );


      // ------------------------------------------------
      // Budget / passenger / preference filtering
      // ------------------------------------------------

      const recommended =
        analyzedVehicles
          .filter(
            (vehicle) => {

              const price =
                Number(
                  vehicle
                    .estimatedHirePrice
                );


              const matchesBudget =
                Number.isFinite(
                  price
                ) &&
                price <=
                  userBudget;


              const matchesPassengers =
                vehicle
                  .seatingCapacity >=
                passengerCount;


              const matchesPreference =
                requestedVehicleCategory
                  ? String(
                      vehicle
                        .vehicleCategory
                    )
                      .toLowerCase()
                      .includes(
                        String(
                          requestedVehicleCategory
                        )
                          .toLowerCase()
                      )
                  : true;


              const suitableForGradient =
                vehicle
                  .vehicleSuitability
                  .suitableForGradient;


              const passesGradientCheck =
                suitableForGradient !==
                false;


              return (
                matchesBudget &&
                matchesPassengers &&
                matchesPreference &&
                passesGradientCheck
              );

            }
          )
          .sort(
            (
              first,
              second
            ) =>
              compareVehiclesByRisk(
                first,
                second,
                riskPrediction.riskLevel
              )
          );


      const bestVehicle =
        recommended[0] ||
        null;


      // ------------------------------------------------
      // Upsell
      //
      // A vehicle outside budget by max 30% that has
      // stronger road capability than the current match.
      // ------------------------------------------------

      const safetyUpsell =
        analyzedVehicles
          .filter(
            (vehicle) => {

              const price =
                Number(
                  vehicle
                    .estimatedHirePrice
                );


              if (
                !Number.isFinite(
                  price
                )
              ) {
                return false;
              }


              const aboveBudget =
                price >
                userBudget;


              const withinUpsellLimit =
                price <=
                userBudget *
                  1.3;


              const enoughSeats =
                vehicle
                  .seatingCapacity >=
                passengerCount;


              const matchesPreference =
                requestedVehicleCategory
                  ? String(
                      vehicle
                        .vehicleCategory
                    )
                      .toLowerCase()
                      .includes(
                        String(
                          requestedVehicleCategory
                        )
                          .toLowerCase()
                      )
                  : true;


              const gradientSuitable =
                vehicle
                  .vehicleSuitability
                  .suitableForGradient;


              const gradientDataAvailable =
                vehicle
                  .vehicleSuitability
                  .gradientDataAvailable;


              const betterCapability =
                gradientDataAvailable &&
                bestVehicle
                  ? vehicle
                      .vehicleSuitability
                      .gradeabilityMargin
                    >
                    bestVehicle
                      .vehicleSuitability
                      .gradeabilityMargin
                  : gradientDataAvailable;


              return (
                aboveBudget &&
                withinUpsellLimit &&
                enoughSeats &&
                matchesPreference &&
                gradientDataAvailable &&
                gradientSuitable === true &&
                betterCapability
              );

            }
          )
          .sort(
            (
              first,
              second
            ) =>
              compareVehiclesByRisk(
                first,
                second,
                riskPrediction.riskLevel
              )
          )[0] ||
        null;


      // ------------------------------------------------
      // API response
      // ------------------------------------------------

      return res.json({

        success:
          true,


        message:
          recommended.length ===
          0
            ? "Route risk analysis completed, but no suitable vehicle matched the current budget, passenger count, preference, and road-gradient requirements."
            : "Route risk analysis and vehicle recommendation completed successfully.",


        systemType:
          "Route Risk ML Classification + Neo4j Historical Evidence + Vehicle Suitability + Dataset Pricing",


        trip: {
  from:
    routeDetails.correctedStartLocation ||
    startLocation,

  to:
    routeDetails.correctedEndLocation ||
    endLocation,

  distanceKm:
    routeDetails.distanceKm,

  durationMinutes:
    routeDetails.durationMinutes,
},


        riskPrediction: {

          riskLevel:
            riskPrediction
              .riskLevel,

          confidence:
            riskPrediction
              .confidence,

          confidencePercent:
            riskPrediction
              .confidencePercent,

          probabilities:
            riskPrediction
              .probabilities,

          modelName:
            riskPrediction
              .modelName,

          predictionScope:
            "Route-level risk classification",

        },


        analysis: {

          matchedRoad:
            matchedRoadName,

          roadAggregation:
            roadInfo._aggregationType ||
            null,

          aggregatedSegmentCount:
            roadInfo._segmentCount ||
            1,

          gradient:
            roadGradient,

          gradientDataAvailable:
            roadGradient !== null,

          gradientAnalysisStatus:
            roadGradient !== null
              ? "available"
              : "unavailable",

          terrain:
            getField(
              roadInfo,
              [
                "Terrain Type",
              ],
              "Unknown"
            ),

          roadSurface:
            getField(
              roadInfo,
              [
                "Road Surface Condition",
              ],
              "Unknown"
            ),

          averageElevation:
            toNullableNumber(
              getField(
                roadInfo,
                [
                  "Average Elevation",
                  "Average Elevation (m)",
                ]
              )
            ),

          surfaceFrictionIndex:
            toNullableNumber(
              getField(
                roadInfo,
                [
                  "Surface Friction Index",
                ]
              )
            ),

          typicalRoadWidth:
            getField(
              roadInfo,
              [
                "Typical Road Width",
                "Typical Road Width (m)",
              ],
              "Unknown"
            ),

          weather:
            weatherInfo
              ?.weatherDescription ??
            null,

          temperature:
            weatherInfo
              ?.temperature ??
            null,

          weatherLocation:
            weatherInfo
              ?.locationName ??
            null,

          rainDetected:
            isRaining,

          weatherUsage:
            "Displayed as current trip context; not used as an unvalidated manual ML score multiplier.",

          predictionSource:
            "Python Random Forest risk classifier",

          graphContext:
            graphContext,

          pricingSource:
            "Vehicle dataset BaseHireCharge + RentalPricePerKM",

        },


        graphRAG:
          graphReasoning,


        bestSafetyMatch:
          bestVehicle,


        bestVehicle:
          bestVehicle,


        alternativeOptions:
          recommended.slice(
            1,
            3
          ),


        safetyUpsell:
          safetyUpsell,


        totalVehiclesAnalyzed:
          analyzedVehicles.length,


        totalVehiclesWithinBudget:
          recommended.length,

      });


    } catch (error) {

      console.error(
        "Safety Route Error:",
        error
      );


      return res
        .status(500)
        .json({

          success:
            false,

          message:
            "Internal server error.",

          error:
            error.message,

        });

    }
  }
);


module.exports =
  router;

module.exports.__test = {
  calculateVehicleSuitability,
};
