const axios = require("axios");

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
      }
    );

    const weatherMain = response.data.weather?.[0]?.main || "";
    const weatherDescription = response.data.weather?.[0]?.description || "";

    const isRaining =
      weatherMain.toLowerCase().includes("rain") ||
      weatherDescription.toLowerCase().includes("rain") ||
      response.data.rain !== undefined;

    return {
      isRaining,
      temperature: response.data.main?.temp,
      weatherMain,
      weatherDescription,
      locationName: response.data.name,
    };
  } catch (error) {
    console.error("Weather API Error:", error.response?.data || error.message);

    return {
      isRaining: false,
      temperature: null,
      weatherMain: "Unknown",
      weatherDescription: "Weather data unavailable",
      locationName: null,
    };
  }
};

module.exports = {
  getWeatherByCoordinates,
};