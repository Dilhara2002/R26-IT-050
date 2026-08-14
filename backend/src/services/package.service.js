import { driver } from "../config/neo4j.js";

const serializeGraphValue = (value) => {
  if (value && typeof value.toNumber === "function") return value.toNumber();
  if (Array.isArray(value)) return value.map(serializeGraphValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, serializeGraphValue(nested)])
    );
  }
  return value;
};

export const findMatchingPackages = async (preferences) => {
  const session = driver.session();

  try {
    const result = await session.run(
      `
      MATCH (h:Hotel)-[:LOCATED_IN]->(d:District)
      MATCH (h)-[:NEAR_ACTIVITY]->(a:Activity)

      WHERE ($district IS NULL OR toLower(d.name) = toLower($district))

      AND ($hotelCategory IS NULL OR toLower(h.category) = toLower($hotelCategory))

      AND ($grade IS NULL OR toLower(h.final_grade) = toLower($grade))

      AND (
        $foodType IS NULL OR
        (
          toLower($foodType) = "non-veg"
          AND toLower(h.food_type) CONTAINS "non"
        )
        OR
        (
          toLower($foodType) = "veg"
          AND toLower(h.food_type) CONTAINS "veg"
        )
      )

      AND ($activityCategory IS NULL OR toLower(a.category) = toLower($activityCategory))

      AND ($priceLevel IS NULL OR toLower(a.price_level) = toLower($priceLevel))

      AND ($suitableFor IS NULL OR toLower(a.suitable_for) = toLower($suitableFor))

      RETURN
        h.hotel_id AS hotelId,
        h.name AS hotelName,
        h.category AS hotelCategory,
        h.final_grade AS grade,
        h.food_type AS foodType,
        h.rooms AS rooms,
        h.latitude AS hotelLatitude,
        h.longitude AS hotelLongitude,
        d.name AS district,

        collect(DISTINCT {
          activityId: a.activity_id,
          name: a.name,
          category: a.category,
          description: a.description,
          durationHours: a.duration_hours,
          priceLevel: a.price_level,
          suitableFor: a.suitable_for,
          latitude: a.latitude,
          longitude: a.longitude
        })[0..5] AS activities

      LIMIT 10
      `,
      {
        district: preferences.district,
        hotelCategory: preferences.hotelCategory,
        grade: preferences.grade,
        foodType: preferences.foodType,
        activityCategory: preferences.activityCategory,
        priceLevel: preferences.priceLevel,
        suitableFor: preferences.suitableFor,
      }
    );

    return result.records.map((record) => serializeGraphValue(record.toObject()));
  } finally {
    await session.close();
  }
};
