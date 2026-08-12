const axios = require("axios");

const {
  getLocationCandidates,
} = require("./llmLocationResolver");


const formatSriLankaLocation = (location) => {
  const text = String(location || "").trim();

  if (text.toLowerCase().includes("sri lanka")) {
    return text;
  }

  return `${text}, Sri Lanka`;
};


const geocodeWithNominatim = async (location) => {
  const searchText = formatSriLankaLocation(location);

  const response = await axios.get(
    "https://nominatim.openstreetmap.org/search",
    {
      params: {
        q: searchText,
        format: "json",
        limit: 1,
        countrycodes: "lk",
      },
      headers: {
        "User-Agent":
          "AI-Powered-Sri-Lankan-Tourism-Platform/1.0",
      },
      timeout: 8000,
    }
  );

  if (
    !response.data ||
    response.data.length === 0
  ) {
    return null;
  }

  const place = response.data[0];

  return {
    longitude: Number(place.lon),
    latitude: Number(place.lat),
    label: place.display_name,
    correctedName:
  place.display_name
    ? place.display_name.split(",")[0].trim()
    : location,
    source: "Nominatim",
  };
};


const geocodeWithGeoapify = async (location) => {
  const apiKey =
    process.env.GEOAPIFY_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await axios.get(
    "https://api.geoapify.com/v1/geocode/autocomplete",
    {
      params: {
        text: location,
        type: "locality",
        filter: "countrycode:lk",
        limit: 5,
        format: "json",
        apiKey,
      },
      timeout: 8000,
    }
  );

  const results =
    response.data?.results || [];

  if (results.length === 0) {
    return null;
  }

  const ranked = results
    .filter((item) => {
      return (
        Number.isFinite(Number(item.lat)) &&
        Number.isFinite(Number(item.lon))
      );
    })
    .sort((a, b) => {
      const aConfidence =
        Number(a.rank?.confidence || 0);

      const bConfidence =
        Number(b.rank?.confidence || 0);

      return bConfidence - aConfidence;
    });

  if (ranked.length === 0) {
    return null;
  }

  const best = ranked[0];

  return {
    longitude: Number(best.lon),
    latitude: Number(best.lat),

    label:
      best.formatted ||
      best.name ||
      location,

    correctedName:
      best.name ||
      best.city ||
      location,

    source: "Geoapify",

    confidence:
      Number(
        best.rank?.confidence || 0
      ),
  };
};


const geocodeWithOllamaCandidates = async (
  location
) => {
  const candidates =
    await getLocationCandidates(location);

  if (
    !Array.isArray(candidates) ||
    candidates.length === 0
  ) {
    return null;
  }

  for (const candidate of candidates) {
    try {
      const result =
        await geocodeWithNominatim(
          candidate
        );

      if (result) {
        return {
          ...result,
          correctedName: candidate,
          source: "Ollama + Nominatim",
        };
      }
    } catch (error) {
      continue;
    }
  }

  return null;
};


const geocodeLocation = async (location) => {
  const cleanLocation =
    String(location || "").trim();

  if (!cleanLocation) {
    throw new Error(
      "Location cannot be empty."
    );
  }

  // 1. Try exact/original user input first
  try {
    const direct =
      await geocodeWithNominatim(
        cleanLocation
      );

    if (direct) {
      return direct;
    }
  } catch (error) {
    console.log(
      `Nominatim direct lookup failed for "${cleanLocation}":`,
      error.message
    );
  }

  console.log(
    `Location not found directly: ${cleanLocation}`
  );

  // 2. Geoapify typo/autocomplete fallback
  try {
    const geoapifyResult =
      await geocodeWithGeoapify(
        cleanLocation
      );

    if (geoapifyResult) {
      console.log(
        `Geoapify corrected "${cleanLocation}" -> "${geoapifyResult.correctedName}"`
      );

      return geoapifyResult;
    }
  } catch (error) {
    console.log(
      `Geoapify lookup failed for "${cleanLocation}":`,
      error.response?.data ||
      error.message
    );
  }

  // 3. Ollama candidate fallback
  try {
    const ollamaResult =
      await geocodeWithOllamaCandidates(
        cleanLocation
      );

    if (ollamaResult) {
      console.log(
        `Ollama fallback corrected "${cleanLocation}" -> "${ollamaResult.correctedName}"`
      );

      return ollamaResult;
    }
  } catch (error) {
    console.log(
      `Ollama fallback failed for "${cleanLocation}":`,
      error.message
    );
  }

  throw new Error(
    `Unable to resolve location: ${cleanLocation}`
  );
};


const getRouteDetails = async (
  startLocation,
  endLocation
) => {
  try {
    const start =
      await geocodeLocation(
        startLocation
      );

    const end =
      await geocodeLocation(
        endLocation
      );

    const coordinates =
      `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;

    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}`,
      {
        params: {
          overview: "false",
          alternatives: "false",
          steps: "false",
        },
        timeout: 10000,
      }
    );

    const route =
      response.data?.routes?.[0];

    if (!route) {
      throw new Error(
        "No route found between locations."
      );
    }

    return {
      distanceKm:
        Number(
          (route.distance / 1000)
            .toFixed(2)
        ),

      durationMinutes:
        Number(
          (route.duration / 60)
            .toFixed(0)
        ),

      startLocationLabel:
        start.label,

      endLocationLabel:
        end.label,

      correctedStartLocation:
        start.correctedName ||
        startLocation,

      correctedEndLocation:
        end.correctedName ||
        endLocation,

      startLocationSource:
        start.source,

      endLocationSource:
        end.source,

      startCoordinates: {
        longitude:
          start.longitude,

        latitude:
          start.latitude,
      },

      endCoordinates: {
        longitude:
          end.longitude,

        latitude:
          end.latitude,
      },
    };
  } catch (error) {
    console.error(
      "Route Error:",
      error.response?.data ||
      error.message
    );

    throw new Error(
      "Failed to fetch route details"
    );
  }
};


module.exports = {
  getRouteDetails,
};