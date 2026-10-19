import axios from "axios";


// Preserve observed false; absence is not evidence of dry weather.
export const normalizeWeather = (weather) => {
  const available = weather?.status !== "unavailable" && Boolean(
    weather && (weather.status === "available" ||
      (weather.weatherMain && weather.weatherMain !== "Unknown"))
  );
  return {
    ...weather,
    status: available ? "available" : "unavailable",
    isRaining: available && typeof weather.isRaining === "boolean" ? weather.isRaining : null,
    temperature: available ? weather.temperature ?? null : null,
    weatherMain: available ? weather.weatherMain ?? "Unknown" : "Unknown",
    weatherDescription: available ? weather.weatherDescription ?? null : "Weather data unavailable",
    locationName: available ? weather.locationName ?? null : null,
  };
};

export const getWeatherByCoordinates = async (
  latitude,
  longitude
) => {

  try {

    const apiKey =
      process.env.OPENWEATHER_API_KEY;


    if (!apiKey) {

      throw new Error(
        "OPENWEATHER_API_KEY is missing in .env"
      );

    }



    const response =
      await axios.get(
        "https://api.openweathermap.org/data/2.5/weather",
        {
          timeout: 5000,
          params: {

            lat: latitude,

            lon: longitude,

            appid: apiKey,

            units: "metric",

          },
        }
      );



    const weatherMain =
      response.data.weather?.[0]?.main || "";


    const weatherDescription =
      response.data.weather?.[0]?.description || "";



    if (!weatherMain && !weatherDescription) return normalizeWeather(null);

    const isRaining =

      weatherMain
        .toLowerCase()
        .includes("rain")

      ||

      weatherDescription
        .toLowerCase()
        .includes("rain")

      ||

      response.data.rain !== undefined;



    return {

      status: "available",
      isRaining,

      temperature:
        response.data.main?.temp,

      weatherMain,

      weatherDescription,

      locationName:
        response.data.name,

    };


  } catch(error) {


    return normalizeWeather(null);

  }

};