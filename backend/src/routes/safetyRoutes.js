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

const ML_PREDICTION_TIMEOUT_MS =
  Number(
    process.env.ML_PREDICTION_TIMEOUT_MS ||
    15000
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


const getRiskRankingCriteria = (
  riskLevel
) => {
  const normalizedRiskLevel =
    String(riskLevel || "")
      .toLowerCase()
      .trim();

  if (normalizedRiskLevel === "low") {
    return [
      "lower estimated hire price",
      "higher gradeability margin",
    ];
  }

  if (normalizedRiskLevel === "high") {
    return [
      "higher gradeability margin",
      "higher maximum torque",
      "larger engine capacity",
      "lower estimated hire price",
    ];
  }

  return [
    "higher gradeability margin",
    "higher maximum torque",
    "lower estimated hire price",
  ];
};


const buildVehicleRecommendationExplanation = (
  {
    vehicle,
    userBudget,
    passengerCount,
    requestedVehicleCategory,
    riskLevel,
  }
) => {
  if (!vehicle) {
    return {
      status: "no_match",
      decisionType:
        "deterministic_vehicle_filtering_and_ranking",
      reason:
        "No vehicle met the current budget, passenger, category, and road-gradient requirements.",
    };
  }

  const suitability =
    vehicle.vehicleSuitability || {};

  const categoryRequested =
    Boolean(requestedVehicleCategory);

  const categoryMatch =
    !categoryRequested ||
    String(vehicle.vehicleCategory)
      .toLowerCase()
      .includes(
        String(requestedVehicleCategory)
          .toLowerCase()
      );

  const gradientKnown =
    suitability.gradientDataAvailable ===
    true;

  const gradientReason =
    gradientKnown
      ? `Its gradeability exceeds the known route gradient by ${suitability.gradeabilityMargin} percentage points.`
      : "Route gradient data is unavailable, so gradient suitability was not used to reject this vehicle.";

  const categoryReason =
    categoryRequested
      ? `It matches the requested ${requestedVehicleCategory} category.`
      : "No vehicle category preference was requested.";

  return {
    status: "selected",
    decisionType:
      "deterministic_vehicle_filtering_and_ranking",
    filters: {
      budgetMatch:
        vehicle.estimatedHirePrice <=
        userBudget,
      passengerCapacityMatch:
        vehicle.seatingCapacity >=
        passengerCount,
      requestedCategory:
        requestedVehicleCategory ||
        null,
      categoryMatch,
      gradientDataAvailable:
        gradientKnown,
      gradientSuitability:
        suitability.gradientSuitability ||
        "unknown",
      gradeability:
        suitability.gradeability ??
        null,
      routeGradient:
        suitability.roadGradient ??
        null,
      gradeabilityMargin:
        suitability.gradeabilityMargin ??
        null,
    },
    ranking: {
      riskLevel,
      criteria:
        getRiskRankingCriteria(
          riskLevel
        ),
      note:
        "These are transparent ranking rules using vehicle dataset attributes; they do not prove crash safety.",
    },
    reason:
      `Matches the budget and passenger capacity requirements. ${categoryReason} ${gradientReason}`,
  };
};


const buildSafetyUpsellExplanation = (
  {
    safetyUpsell,
    bestVehicle,
    userBudget,
    roadGradient,
  }
) => {
  if (roadGradient === null) {
    return {
      status: "not_available",
      reason:
        "No stronger road-capability upsell is generated because route gradient data is unavailable.",
    };
  }

  if (!safetyUpsell) {
    return {
      status: "not_available",
      reason:
        "No qualifying stronger road-capability option was found within the 30% upsell limit.",
    };
  }

  const bestMargin =
    bestVehicle?.vehicleSuitability
      ?.gradeabilityMargin ??
    null;

  const upsellMargin =
    safetyUpsell.vehicleSuitability
      ?.gradeabilityMargin ??
    null;

  return {
    status: "available",
    decisionType:
      "deterministic_stronger_road_capability_option",
    priceDifferenceFromBudget:
      Number(
        (
          safetyUpsell.estimatedHirePrice -
          userBudget
        ).toFixed(2)
      ),
    priceDifferenceFromBestVehicle:
      bestVehicle
        ? Number(
            (
              safetyUpsell.estimatedHirePrice -
              bestVehicle.estimatedHirePrice
            ).toFixed(2)
          )
        : null,
    routeGradient:
      roadGradient,
    gradeabilityMargin:
      upsellMargin,
    gradeabilityMarginImprovement:
      bestMargin !== null &&
      upsellMargin !== null
        ? Number(
            (
              upsellMargin - bestMargin
            ).toFixed(2)
          )
        : null,
    reason:
      "This option is above the requested budget but within the 30% upsell limit and meets the known route-gradient requirement with stronger gradeability evidence.",
    limitation:
      "Stronger road capability is based on gradeability and available vehicle attributes; it is not a claim of proven crash safety.",
  };
};


const buildRiskExplanation = (
  {
    riskPrediction,
    mlInput,
    weatherInfo,
    graphContext,
    graphReasoning,
    roadInfo,
  }
) => {
  const graphStatus =
    graphReasoning?.status ||
    graphContext?.status ||
    (
      graphContext?.matchType ===
      "unavailable"
        ? "unavailable"
        : "available"
    );

  return {
    risk: {
      predictedLevel:
        riskPrediction.riskLevel,
      modelName:
        riskPrediction.modelName,
      confidence:
        riskPrediction.confidence ??
        null,
      confidenceType:
        riskPrediction.confidenceType ||
        (
          riskPrediction.confidence === null ||
          riskPrediction.confidence === undefined
            ? "unavailable"
            : "predicted_class_probability"
        ),
      confidenceInterpretation:
        riskPrediction.confidenceInterpretation ||
        "Probability assigned by the classifier to the predicted class; it is not a calibrated real-world accident or disaster probability.",
      modelInputs:
        riskPrediction.inputFeatures ||
        mlInput,
      modelInputNote:
        "These are the feature values supplied to the deployed classifier for this request.",
      limitations: [
        "The predicted class is a historical hazard/risk severity classification, not an accident probability.",
        "The explanation trace reports available inputs and rules; it does not prove causal relationships.",
      ],
    },
    contextualEvidence: {
      weather: {
        status:
          weatherInfo?.status ||
          "unavailable",
        isEnrichmentOnly: true,
        usedAsModelInput: false,
        rainDetected:
          weatherInfo?.isRaining ??
          null,
        description:
          weatherInfo?.weatherDescription ??
          null,
        note:
          "Weather is displayed as current trip context and is not an input to the deployed risk classifier.",
      },
      neo4j: {
        status: graphStatus,
        retrievalContextAvailable:
          graphStatus === "available",
        graphValuesCanPopulateModelInputs: true,
        modelInputFields: [
          "historical_occurrence_count",
          "hazard_type",
          "season",
        ],
        note:
          "Retrieved graph values can populate named classifier inputs when available; historical graph reasoning does not independently generate or override the model prediction.",
      },
      roadContext: {
        matchedRoad:
          getField(
            roadInfo,
            [
              "Route/Segment Name",
            ]
          ),
        aggregationType:
          roadInfo._aggregationType ||
          null,
        segmentCount:
          roadInfo._segmentCount ||
          1,
        note:
          "Road-profile values are route-family aggregates where available; they are not exact GPS traversed-segment measurements.",
      },
    },
  };
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

      let timeout;


      const rejectMlUnavailable = (
        message
      ) => {

        if (settled) {
          return;
        }

        settled = true;

        clearTimeout(timeout);

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

          clearTimeout(timeout);

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


      timeout = setTimeout(
        () => {
          if (settled) {
            return;
          }

          pythonProcess.kill();

          rejectMlUnavailable(
            `ML prediction timed out after ${ML_PREDICTION_TIMEOUT_MS}ms.`
          );
        },
        ML_PREDICTION_TIMEOUT_MS
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


const hasUsableRoadData = (
  roadInfo
) => {
  const values = [
    getField(
      roadInfo,
      [
        "Max Gradient (%)",
        "Average Elevation",
        "Average Elevation (m)",
        "Surface Friction Index",
      ]
    ),
    getField(
      roadInfo,
      [
        "Terrain Type",
        "Road Surface Condition",
        "Typical Road Width",
        "Typical Road Width (m)",
      ]
    ),
  ];

  return values.some(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );
};


const defaultDependencies = {
  getRouteDetails,
  getWeatherByCoordinates,
  getRoadData,
  graphManager,
  runRiskPrediction,
};

let routeDependencies = {
  ...defaultDependencies,
};


const setDependenciesForTesting = (
  overrides = {}
) => {
  routeDependencies = {
    ...routeDependencies,
    ...overrides,
  };
};


const resetDependenciesForTesting = () => {
  routeDependencies = {
    ...defaultDependencies,
  };
};


const getUnavailableWeather = () => ({
  status: "unavailable",
  isRaining: null,
  temperature: null,
  weatherMain: null,
  weatherDescription: null,
  locationName: null,
});


const sendControlledError = (
  res,
  status,
  code,
  message
) =>
  res.status(status).json({
    success: false,
    error: true,
    code,
    message,
  });


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

      const requestBody =
        req.body &&
        typeof req.body === "object"
          ? req.body
          : {};

      const {
        budget,
        passengers,
        startLocation,
        endLocation,
        preferredCategory,
        preferredVehicle,
      } = requestBody;


      const requestedVehicleCategory =
        preferredCategory ||
        preferredVehicle ||
        "";

      const cleanStartLocation =
        typeof startLocation === "string"
          ? startLocation.trim()
          : "";

      const cleanEndLocation =
        typeof endLocation === "string"
          ? endLocation.trim()
          : "";


      // ------------------------------------------------
      // Request validation
      // ------------------------------------------------

      if (
        budget === undefined ||
        passengers === undefined ||
        !cleanStartLocation ||
        !cleanEndLocation
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
        passengerCount <= 0 ||
        !Number.isInteger(
          passengerCount
        )
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

      let routeDetails;

      try {
        routeDetails =
          await routeDependencies.getRouteDetails(
            cleanStartLocation,
            cleanEndLocation
          );
      } catch (error) {
        if (
          error.code ===
            "LOCATION_REQUIRED" ||
          error.code ===
            "LOCATION_NOT_FOUND"
        ) {
          return sendControlledError(
            res,
            422,
            "LOCATION_UNRESOLVABLE",
            "The start or destination location could not be resolved. Please check the location name and try again."
          );
        }

        if (
          error.code ===
            "GEOCODING_UNAVAILABLE" ||
          error.code ===
            "ROUTE_SERVICE_ERROR"
        ) {
          return sendControlledError(
            res,
            503,
            "LOCATION_SERVICE_UNAVAILABLE",
            "The location and routing service is temporarily unavailable. Please try again."
          );
        }

        if (
          error.code ===
            "ROUTE_NOT_FOUND"
        ) {
          return sendControlledError(
            res,
            422,
            "ROUTE_NOT_FOUND",
            "No drivable route was found between the resolved locations."
          );
        }

        throw error;
      }


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

      let weatherInfo;

      try {
        weatherInfo =
          await routeDependencies.getWeatherByCoordinates(
            routeDetails
              .startCoordinates
              .latitude,

            routeDetails
              .startCoordinates
              .longitude
          );
      } catch (error) {
        console.error(
          "Weather lookup failed. Continuing without weather context:",
          error.message
        );

        weatherInfo =
          getUnavailableWeather();
      }


      const isRaining =
        weatherInfo?.isRaining ??
        null;


      // ------------------------------------------------
      // Road dataset
      // ------------------------------------------------

      let roadInfo;

      try {
        roadInfo =
          await routeDependencies.getRoadData(
            cleanStartLocation,
            cleanEndLocation
          );
      } catch (error) {
        console.error(
          "Road data lookup failed:",
          error.message
        );

        return sendControlledError(
          res,
          503,
          "ROAD_DATA_UNAVAILABLE",
          "The road dataset is temporarily unavailable. Please try again."
        );
      }


      if (
        !roadInfo
      ) {

        return res
          .status(404)
          .json({
            success:
              false,

            message:
          `No supported road dataset match was found for ${cleanStartLocation} to ${cleanEndLocation}.`,
          });

      }


      if (!hasUsableRoadData(roadInfo)) {
        return sendControlledError(
          res,
          422,
          "ROAD_DATA_INCOMPLETE",
          "The matched road does not contain enough data for a safety analysis."
        );
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
          routeDependencies.graphManager.getMLRiskContext(
            matchedRoadName
          ),
          routeDependencies.graphManager.getSafetyReasoning(
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
          await routeDependencies.runRiskPrediction(
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

          return sendControlledError(
            res,
            503,
            "ML_UNAVAILABLE",
            "The route risk prediction service is temporarily unavailable. Please try again."
          );

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


      const explanation = {
        ...buildRiskExplanation({
          riskPrediction,
          mlInput,
          weatherInfo,
          graphContext,
          graphReasoning,
          roadInfo,
        }),
        vehicleRecommendation:
          buildVehicleRecommendationExplanation({
            vehicle: bestVehicle,
            userBudget,
            passengerCount,
            requestedVehicleCategory,
            riskLevel:
              riskPrediction.riskLevel,
          }),
        safetyUpsell:
          buildSafetyUpsellExplanation({
            safetyUpsell,
            bestVehicle,
            userBudget,
            roadGradient,
          }),
      };


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

          predictedRiskLevel:
            riskPrediction
              .riskLevel,

          confidence:
            riskPrediction
              .confidence,

          confidencePercent:
            riskPrediction
              .confidencePercent,

          confidenceType:
            riskPrediction
              .confidenceType ||
            (
              riskPrediction.confidence === null ||
              riskPrediction.confidence === undefined
                ? "unavailable"
                : "predicted_class_probability"
            ),

          confidenceInterpretation:
            riskPrediction
              .confidenceInterpretation ||
            "Probability assigned by the classifier to the predicted class; it is not a calibrated real-world accident or disaster probability.",

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
            `Python ${
              riskPrediction.modelName
            } risk classifier`,

          graphContext:
            graphContext,

          pricingSource:
            "Vehicle dataset BaseHireCharge + RentalPricePerKM",

        },


        graphRAG:
          graphReasoning,


        explanation:
          explanation,


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
        error.message
      );

      return sendControlledError(
        res,
        500,
        "SAFETY_ANALYSIS_FAILED",
        "Unable to complete the safety analysis. Please try again."
      );

    }
  }
);


module.exports =
  router;

module.exports.__test = {
  calculateVehicleSuitability,
  setDependenciesForTesting,
  resetDependenciesForTesting,
  ML_PREDICTION_TIMEOUT_MS,
};
