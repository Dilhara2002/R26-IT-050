import path from "path";
import { fileURLToPath } from "url";

import { closeNeo4jConnection } from "../config/neo4j.js";
import { createActivityGraph } from "../services/activityGraph.service.js";
import { loadDataset } from "../services/csv.service.js";
import { createKnowledgeGraph } from "../services/hotelGraph.service.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.join(directory, "../data");

try {
  const [hotels, activities] = await Promise.all([
    loadDataset(path.join(dataDirectory, "SLTDA_Master_Dataset_Updated_Coords.csv")),
    loadDataset(path.join(dataDirectory, "Activities-Rag.csv")),
  ]);
  await createKnowledgeGraph(hotels);
  await createActivityGraph(activities);
  console.log(`Imported ${hotels.length} hotels and ${activities.length} activities.`);
} finally {
  await closeNeo4jConnection();
}
