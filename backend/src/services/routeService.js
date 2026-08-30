import axios from "axios";

import {
  getLocationCandidates
} from "./llmLocationResolver.js";


// ==================================================
// Configuration
// ==================================================

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const GEOAPIFY_URL =
  "https://api.geoapify.com/v1/geocode/autocomplete";

const OSRM_URL =
  "https://router.project-osrm.org/route/v1/driving";

const ROUTING_REQUEST_TIMEOUT_MS =
  Number(process.env.ROUTING_REQUEST_TIMEOUT_MS || 10000);


// A direct Nominatim match must be quite strong.
// Otherwise we allow Geoapify to correct the text.
const DIRECT_MATCH_THRESHOLD = 0.84;

// Geoapify is specifically being used for typo/autocomplete
// resolution, so this can be slightly lower.
const GEOAPIFY_MATCH_THRESHOLD = 0.72;

// Ollama is only a final candidate generator.
// Its candidate must still resemble the user's original text.
const OLLAMA_MATCH_THRESHOLD = 0.68;

const OLLAMA_LOCATION_RESOLVER_ENABLED =
  String(process.env.ENABLE_OLLAMA_LOCATION_RESOLVER || "false").toLowerCase() ===
  "true";


// ==================================================
// Text helpers
// ==================================================

const normalizeText = (value) => {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};


const compactText = (value) => {
  return normalizeText(value)
    .replace(/\s+/g, "");
};


const formatSriLankaLocation = (location) => {
  const text =
    String(location || "").trim();

  if (
    text
      .toLowerCase()
      .includes("sri lanka")
  ) {
    return text;
  }

  return `${text}, Sri Lanka`;
};

const getTrustedCoordinateLocation = (location) => {
  const match = String(location || "").match(
    /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\|(.+)$/
  );
  if (!match) return null;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  const label = match[3].trim();
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !label
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    label,
    correctedName: label,
    source: "Selected hotel coordinates",
    similarity: 1,
  };
};


// ==================================================
// Levenshtein similarity
// ==================================================

const levenshteinDistance = (
  firstValue,
  secondValue
) => {
  const first =
    String(firstValue || "");

  const second =
    String(secondValue || "");

  const matrix =
    Array.from(
      {
        length:
          first.length + 1,
      },
      () =>
        Array(
          second.length + 1
        ).fill(0)
    );


  for (
    let i = 0;
    i <= first.length;
    i += 1
  ) {
    matrix[i][0] = i;
  }


  for (
    let j = 0;
    j <= second.length;
    j += 1
  ) {
    matrix[0][j] = j;
  }


  for (
    let i = 1;
    i <= first.length;
    i += 1
  ) {
    for (
      let j = 1;
      j <= second.length;
      j += 1
    ) {
      const cost =
        first[i - 1] ===
        second[j - 1]
          ? 0
          : 1;


      matrix[i][j] =
        Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] +
            cost
        );
    }
  }


  return matrix[
    first.length
  ][
    second.length
  ];
};


const basicSimilarity = (
  firstValue,
  secondValue
) => {
  const first =
    String(firstValue || "");

  const second =
    String(secondValue || "");


  if (
    !first ||
    !second
  ) {
    return 0;
  }


  if (
    first === second
  ) {
    return 1;
  }


  const maxLength =
    Math.max(
      first.length,
      second.length
    );


  if (
    maxLength === 0
  ) {
    return 1;
  }


  const distance =
    levenshteinDistance(
      first,
      second
    );


  return Math.max(
    0,
    1 -
      distance /
        maxLength
  );
};


const similarityScore = (
  firstValue,
  secondValue
) => {
  const normalFirst =
    normalizeText(
      firstValue
    );

  const normalSecond =
    normalizeText(
      secondValue
    );


  const normalScore =
    basicSimilarity(
      normalFirst,
      normalSecond
    );


  // This makes:
  // "nuwaraeliya"
  // and
  // "Nuwara Eliya"
  // compare correctly.
  const compactScore =
    basicSimilarity(
      compactText(
        firstValue
      ),
      compactText(
        secondValue
      )
    );


  return Math.max(
    normalScore,
    compactScore
  );
};


// ==================================================
// Candidate-name helpers
// ==================================================

const getNominatimCandidateName = (
  place
) => {
  if (
    place?.name
  ) {
    return String(
      place.name
    ).trim();
  }


  if (
    place?.display_name
  ) {
    return String(
      place.display_name
    )
      .split(",")[0]
      .trim();
  }


  return "";
};


const getGeoapifyCandidateName = (
  item
) => {
  return String(
    item?.name ||
    item?.city ||
    item?.county ||
    ""
  ).trim();
};


// ==================================================
// Nominatim candidates
// ==================================================

const getNominatimCandidates = async (
  location
) => {
  const searchText =
    formatSriLankaLocation(
      location
    );


  const response =
    await axios.get(
      NOMINATIM_URL,
      {
        params: {
          q:
            searchText,

          format:
            "json",

          limit:
            5,

          countrycodes:
            "lk",

          namedetails:
            1,
        },

        headers: {
          "User-Agent":
            "AI-Powered-Sri-Lankan-Tourism-Platform/1.0",
        },

        timeout:
          8000,
      }
    );


  const places =
    Array.isArray(
      response.data
    )
      ? response.data
      : [];


  return places
    .map((place) => {
      const name =
        getNominatimCandidateName(
          place
        );


      const similarity =
        similarityScore(
          location,
          name
        );


      return {
        longitude:
          Number(
            place.lon
          ),

        latitude:
          Number(
            place.lat
          ),

        label:
          place.display_name ||
          name,

        correctedName:
          name,

        source:
          "Nominatim",

        similarity:
          Number(
            similarity.toFixed(4)
          ),

        raw:
          place,
      };
    })

    .filter(
      (candidate) =>
        candidate.correctedName &&
        Number.isFinite(
          candidate.longitude
        ) &&
        Number.isFinite(
          candidate.latitude
        )
    )

    .sort(
      (a, b) =>
        b.similarity -
        a.similarity
    );
};


// ==================================================
// Geoapify candidates
// ==================================================

const getGeoapifyCandidates = async (
  location
) => {
  const apiKey =
    process.env
      .GEOAPIFY_API_KEY;


  if (!apiKey) {
    return [];
  }


  const response =
    await axios.get(
      GEOAPIFY_URL,
      {
        params: {
          text:
            location,

          type:
            "locality",

          filter:
            "countrycode:lk",

          limit:
            5,

          format:
            "json",

          apiKey,
        },

        timeout:
          8000,
      }
    );


  const results =
    response.data
      ?.results || [];


  return results
    .map((item) => {
      const name =
        getGeoapifyCandidateName(
          item
        );


      const similarity =
        similarityScore(
          location,
          name
        );


      const confidence =
        Number(
          item.rank
            ?.confidence ||
          0
        );


      return {
        longitude:
          Number(
            item.lon
          ),

        latitude:
          Number(
            item.lat
          ),

        label:
          item.formatted ||
          name,

        correctedName:
          name,

        source:
          "Geoapify",

        similarity:
          Number(
            similarity.toFixed(4)
          ),

        confidence:
          Number(
            confidence.toFixed(4)
          ),

        raw:
          item,
      };
    })

    .filter(
      (candidate) =>
        candidate.correctedName &&
        Number.isFinite(
          candidate.longitude
        ) &&
        Number.isFinite(
          candidate.latitude
        )
    )

    .sort(
      (a, b) => {
        if (
          b.similarity !==
          a.similarity
        ) {
          return (
            b.similarity -
            a.similarity
          );
        }


        return (
          b.confidence -
          a.confidence
        );
      }
    );
};


// ==================================================
// Ollama verified fallback
// ==================================================

const geocodeWithOllamaCandidates =
  async (
    originalLocation
  ) => {
    let candidates = [];


    try {
      candidates =
        await getLocationCandidates(
          originalLocation
        );
    } catch (error) {
      console.log(
        `Ollama candidate generation failed for "${originalLocation}":`,
        error.message
      );

      return null;
    }


    if (
      !Array.isArray(
        candidates
      ) ||
      candidates.length === 0
    ) {
      return null;
    }


    for (
      const candidateName
      of candidates
    ) {
      const candidateSimilarity =
        similarityScore(
          originalLocation,
          candidateName
        );


      // Critical protection:
      // prevents things such as
      // abcxyz -> Anuradhapura.
      if (
        candidateSimilarity <
        OLLAMA_MATCH_THRESHOLD
      ) {
        continue;
      }


      try {
        const verified =
          await getNominatimCandidates(
            candidateName
          );


        if (
          verified.length === 0
        ) {
          continue;
        }


        const best =
          verified[0];


        // Candidate must also be a
        // strong match to what Ollama said.
        const verificationSimilarity =
          similarityScore(
            candidateName,
            best.correctedName
          );


        if (
          verificationSimilarity <
          DIRECT_MATCH_THRESHOLD
        ) {
          continue;
        }


        return {
          ...best,

          source:
            "Ollama + Nominatim",

          originalInput:
            originalLocation,

          aiCandidate:
            candidateName,

          inputSimilarity:
            Number(
              candidateSimilarity
                .toFixed(4)
            ),
        };

      } catch (error) {
        continue;
      }
    }


    return null;
  };


// ==================================================
// Main location resolver
// ==================================================

const geocodeLocation = async (
  location
) => {
  const cleanLocation =
    String(
      location || ""
    ).trim();


  if (!cleanLocation) {
    const error =
      new Error(
        "Location cannot be empty."
      );

    error.code =
      "LOCATION_REQUIRED";

    throw error;
  }

  const trustedCoordinateLocation = getTrustedCoordinateLocation(cleanLocation);
  if (trustedCoordinateLocation) {
    return trustedCoordinateLocation;
  }


  // ----------------------------------------------
  // 1. Nominatim direct lookup
  // ----------------------------------------------

  try {
    const nominatimCandidates =
      await getNominatimCandidates(
        cleanLocation
      );


    if (
      nominatimCandidates.length >
      0
    ) {
      const best =
        nominatimCandidates[0];


      if (
        best.similarity >=
        DIRECT_MATCH_THRESHOLD
      ) {
        console.log(
          `Nominatim accepted "${cleanLocation}" -> "${best.correctedName}" (similarity=${best.similarity})`
        );

        return best;
      }


      console.log(
        `Nominatim result rejected for "${cleanLocation}": "${best.correctedName}" similarity=${best.similarity}`
      );
    }
  } catch (error) {
    console.log(
      `Nominatim lookup failed for "${cleanLocation}":`,
      error.message
    );
  }


  // ----------------------------------------------
  // 2. Geoapify typo/autocomplete resolution
  // ----------------------------------------------

  try {
    const geoapifyCandidates =
      await getGeoapifyCandidates(
        cleanLocation
      );


    if (
      geoapifyCandidates.length >
      0
    ) {
      const best =
        geoapifyCandidates[0];


      if (
        best.similarity >=
        GEOAPIFY_MATCH_THRESHOLD
      ) {
        console.log(
          `Geoapify accepted "${cleanLocation}" -> "${best.correctedName}" (similarity=${best.similarity}, confidence=${best.confidence})`
        );

        return best;
      }


      console.log(
        `Geoapify result rejected for "${cleanLocation}": "${best.correctedName}" similarity=${best.similarity}`
      );
    }
  } catch (error) {
    console.log(
      `Geoapify lookup failed for "${cleanLocation}":`,
      error.response?.data ||
      error.message
    );
  }


  // ----------------------------------------------
  // 3. Ollama candidate generation
  //
  // AI never becomes final authority.
  // Candidate must pass similarity +
  // Nominatim verification.
  // ----------------------------------------------

  try {
    const ollamaResult = OLLAMA_LOCATION_RESOLVER_ENABLED
      ? await geocodeWithOllamaCandidates(cleanLocation)
      : null;


    if (ollamaResult) {
      console.log(
        `Ollama verified "${cleanLocation}" -> "${ollamaResult.correctedName}"`
      );

      return ollamaResult;
    }
  } catch (error) {
    console.log(
      `Ollama fallback failed for "${cleanLocation}":`,
      error.message
    );
  }


  // ----------------------------------------------
  // Nothing trustworthy was found.
  // Do NOT silently route somewhere else.
  // ----------------------------------------------

  const error =
    new Error(
      `Unable to confidently resolve location: ${cleanLocation}`
    );

  error.code =
    "LOCATION_NOT_FOUND";

  throw error;
};


// ==================================================
// Route calculation
// ==================================================

const mapOsrmRoutes = (routes, start, end) =>
  routes.map((route, index) => ({
    routeId: `osrm-${index + 1}`,
    provider: "OSRM",
    isFastestRoute: index === 0,
    distanceKm: Number((route.distance / 1000).toFixed(2)),
    durationMinutes: Number((route.duration / 60).toFixed(0)),
    geometry:
      route.geometry?.type === "LineString" &&
      Array.isArray(route.geometry.coordinates)
        ? route.geometry
        : null,
    roadNames: [...new Set(
      (route.legs || [])
        .flatMap((leg) => leg.steps || [])
        .flatMap((step) => [step.ref, step.name])
        .map((label) => String(label || "").trim())
        .filter(Boolean)
    )],
    startLocationLabel: start.label,
    endLocationLabel: end.label,
    correctedStartLocation: start.correctedName,
    correctedEndLocation: end.correctedName,
    startLocationSource: start.source,
    endLocationSource: end.source,
    startLocationSimilarity: start.similarity ?? null,
    endLocationSimilarity: end.similarity ?? null,
    startCoordinates: {
      longitude: start.longitude,
      latitude: start.latitude,
    },
    endCoordinates: {
      longitude: end.longitude,
      latitude: end.latitude,
    },
  }));

const requestRouteAlternatives = async (start, end) => {
  const coordinates =
    `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
  const response = await axios.get(`${OSRM_URL}/${coordinates}`, {
    params: {
      overview: "full",
      alternatives: "true",
      steps: "true",
      geometries: "geojson",
    },
    timeout: ROUTING_REQUEST_TIMEOUT_MS,
  });

  if (!Array.isArray(response.data?.routes)) {
    const error = new Error("Routing service returned an invalid response.");
    error.code = "ROUTE_SERVICE_ERROR";
    throw error;
  }
  if (response.data.routes.length === 0) {
    const error = new Error("No route found between the supplied locations.");
    error.code = "ROUTE_NOT_FOUND";
    throw error;
  }
  return mapOsrmRoutes(response.data.routes, start, end);
};

const getRouteAlternativesByCoordinates = async (start, end) => {
  try {
    return await requestRouteAlternatives(
      {
        longitude: start.lon,
        latitude: start.lat,
        label: start.name,
        correctedName: start.name,
        source: "request-coordinates",
      },
      {
        longitude: end.lon,
        latitude: end.lat,
        label: end.name,
        correctedName: end.name,
        source: "request-coordinates",
      }
    );
  } catch (error) {
    if (["ROUTE_NOT_FOUND", "ROUTE_SERVICE_ERROR"].includes(error.code)) {
      throw error;
    }
    const wrappedError = new Error("Failed to fetch route details.");
    wrappedError.code = "ROUTE_SERVICE_ERROR";
    throw wrappedError;
  }
};

const getRouteAlternatives = async (startLocation, endLocation) => {
  try {
    const start = await geocodeLocation(startLocation);
    const end = await geocodeLocation(endLocation);
    return await requestRouteAlternatives(
      { ...start, correctedName: start.correctedName || startLocation },
      { ...end, correctedName: end.correctedName || endLocation }
    );
  } catch (error) {
    if ([
      "LOCATION_REQUIRED",
      "LOCATION_NOT_FOUND",
      "ROUTE_NOT_FOUND",
      "ROUTE_SERVICE_ERROR",
    ].includes(error.code)) {
      throw error;
    }
    const wrappedError = new Error("Failed to fetch route details.");
    wrappedError.code = "ROUTE_SERVICE_ERROR";
    throw wrappedError;
  }
};

const getRouteDetails = async (startLocation, endLocation) =>
  (await getRouteAlternatives(startLocation, endLocation))[0];

export {
  getRouteDetails,
  getRouteAlternatives,
  getRouteAlternativesByCoordinates,
  ROUTING_REQUEST_TIMEOUT_MS,
};
