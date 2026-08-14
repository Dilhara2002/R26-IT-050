import { driver } from "../config/neo4j.config.js";

export const getGraphSchemaValues = async () => {
  const session = driver.session();

  try {
    const result = await session.run(`
      MATCH (d:District)
      WITH collect(DISTINCT d.name) AS districts

      MATCH (h:Hotel)
      WITH districts,
           collect(DISTINCT h.category) AS hotelCategories,
           collect(DISTINCT h.final_grade) AS grades,
           collect(DISTINCT h.food_type) AS foodTypes

      MATCH (a:Activity)
      RETURN
        districts,
        hotelCategories,
        grades,
        foodTypes,
        collect(DISTINCT a.category) AS activityCategories,
        collect(DISTINCT a.price_level) AS priceLevels,
        collect(DISTINCT a.suitable_for) AS suitableFor
    `);

    return result.records[0].toObject();
  } finally {
    await session.close();
  }
};