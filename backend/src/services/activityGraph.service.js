import { driver } from "../config/neo4j.config.js";

export const createActivityGraph = async (rows) => {
  const session = driver.session();

  try {
    for (const row of rows) {
      await session.run(
        `
        MERGE (a:Activity {activity_id: $activity_id})
        SET a.name = $name,
            a.category = $category,
            a.description = $description,
            a.latitude = toFloat($latitude),
            a.longitude = toFloat($longitude),
            a.opening_hours = $opening_hours,
            a.price_level = $price_level,
            a.suitable_for = $suitable_for,
            a.duration_hours = toInteger($duration_hours)

        MERGE (d:District {name: $district})
        MERGE (a)-[:LOCATED_IN]->(d)

        WITH a, d
        MATCH (h:Hotel)-[:LOCATED_IN]->(d)
        MERGE (h)-[:NEAR_ACTIVITY]->(a)
        MERGE (a)-[:NEAR_HOTEL]->(h)
        `,
        {
          activity_id: row["Activity_ID"],
          name: row["Name"],
          district: row["District"],
          category: row["Category"],
          description: row["Description"],
          latitude: row["Latitude"],
          longitude: row["Longitude"],
          opening_hours: row["Opening_Hours"],
          price_level: row["Price_Level"],
          suitable_for: row["Suitable_For"],
          duration_hours: row["Duration_Hours"],
        }
      );
    }

    console.log("Activity graph created:", rows.length);
  } finally {
    await session.close();
  }
};