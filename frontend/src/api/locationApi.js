import axios from "axios";

export const searchSriLankanLocations = async (query) => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const response = await axios.get(
    "https://photon.komoot.io/api/",
    {
      params: {
        q: `${query}, Sri Lanka`,
        limit: 5,
      },
    }
  );

  return response.data.features
    .filter((item) =>
      item.properties?.country?.toLowerCase().includes("sri lanka")
    )
    .map((item) => ({
      name: item.properties.name,
      city: item.properties.city,
      state: item.properties.state,
      displayName: [
        item.properties.name,
        item.properties.city,
        item.properties.state,
      ]
        .filter(Boolean)
        .join(", "),
    }));
};