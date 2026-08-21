const axios = require("axios");

const WEATHER_REQUEST_TIMEOUT_MS =
  Number(
    process.env.WEATHER_REQUEST_TIMEOUT_MS ||
    8000
  );


const getUnavailableWeather = () => ({
  status: "unavailable",
  isRaining: null,
  temperature: null,
  weatherMain: null,
  weatherDescription: null,
  locationName: null,
});

const getWeatherByCoordinates = async (latitude, longitude) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      throw new Error("OPENWEATHER_API_KEY is missing in .env");
    }

    const response = await axios.get(
      "https://api.openweathermap.org/data/2.5/weather",
      {
        params: {
          lat: latitude,
          lon: longitude,
          appid: apiKey,
          units: "metric",
        },

        timeout:
          WEATHER_REQUEST_TIMEOUT_MS,
      }
    );

    if (
      !response.data ||
      typeof response.data !== "object" ||
      !Array.isArray(
        response.data.weather
      ) ||
      !response.data.weather[0]
    ) {
      throw new Error(
        "Weather API returned an invalid response."
      );
    }

    const weatherMain = response.data.weather?.[0]?.main || "";
    const weatherDescription = response.data.weather?.[0]?.description || "";

    const isRaining =
      weatherMain.toLowerCase().includes("rain") ||
      weatherDescription.toLowerCase().includes("rain") ||
      response.data.rain !== undefined;

    return {
      status: "available",
      isRaining,
      temperature: response.data.main?.temp,
      weatherMain,
      weatherDescription,
      locationName: response.data.name,
    };
  } catch (error) {
    console.error("Weather API Error:", error.response?.data || error.message);

    return getUnavailableWeather();
  }
};

module.exports = {
  getWeatherByCoordinates,
  WEATHER_REQUEST_TIMEOUT_MS,
};
