import { driver } from "../config/neo4j.config.js";

export const createKnowledgeGraph = async (rows) => {
  const session = driver.session();

  try {
    for (const row of rows) {
      await session.run(
        `
        MERGE (h:Hotel {hotel_id: $hotel_id})
        SET h.name = $name,
            h.rooms = toInteger($rooms),
            h.category = $category,
            h.grade = $grade,
            h.final_grade = $final_grade,
            h.food_type = $food_type,
            h.latitude = toFloat($latitude),
            h.longitude = toFloat($longitude)

        MERGE (d:District {name: $district})
        MERGE (aga:AGADivision {name: $aga})
        MERGE (ps:AdminArea {name: $ps})

        MERGE (h)-[:LOCATED_IN]->(d)
        MERGE (h)-[:IN_DIVISION]->(aga)
        MERGE (h)-[:ADMIN_AREA]->(ps)
        `,
        {
          hotel_id: row["Hotel_ID"],
          name: row["Name"],
          rooms: row["Rooms"],
          category: row["Category"],
          grade: row["Grade"],
          final_grade: row["Final_Grade"],
          food_type: row["Food_Type"],
          latitude: row["Latitude"],
          longitude: row["Logitiute"],
          district: row["District"],
          aga: row["AGA Division"],
          ps: row["PS/MC/UC"],
        }
      );
    }

    console.log("Knowledge graph created for rows:", rows.length);
  } finally {
    await session.close();
  }
};