const axios = require("axios");

const formatSriLankaLocation = (location) => {
  const text = location.trim();

  if (text.toLowerCase().includes("sri lanka")) {
    return text;
  }

  return `${text}, Sri Lanka`;
};

const geocodeLocation = async (location) => {
  try {
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
      }
    );

    if (!response.data || response.data.length === 0) {
      throw new Error(`No coordinates found for ${searchText}`);
    }

    const place = response.data[0];

    return {
      longitude: Number(place.lon),
      latitude: Number(place.lat),
      label: place.display_name,
    };
  } catch (error) {
    console.error(
      "Geocoding Error:",
      error.response?.data || error.message
    );

    throw new Error(`Geocoding failed for ${location}`);
  }
};

const getRouteDetails = async (startLocation, endLocation) => {
  try {
    const start = await geocodeLocation(startLocation);
    const end = await geocodeLocation(endLocation);

    const coordinates = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;

    const response = await axios.get(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}`,
      {
        params: {
          overview: "false",
          alternatives: "false",
          steps: "false",
        },
      }
    );

    const route = response.data.routes?.[0];

    if (!route) {
      throw new Error("No route found between locations.");
    }

    return {
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMinutes: Number((route.duration / 60).toFixed(0)),
      startLocationLabel: start.label,
      endLocationLabel: end.label,
      startCoordinates: {
        longitude: start.longitude,
        latitude: start.latitude,
      },
      endCoordinates: {
        longitude: end.longitude,
        latitude: end.latitude,
      },
    };
  } catch (error) {
    console.error(
      "Route Error:",
      error.response?.data || error.message
    );

    throw new Error("Failed to fetch route details");
  }
};

module.exports = {
  getRouteDetails,
};