import path from "path";
import { fileURLToPath } from "url";
import { loadDataset } from "../services/csv.service.js";
import { createKnowledgeGraph } from "../services/hotelGraph.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const buildGraphFromDataset = async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../data/SLTDA_Master_Dataset_Updated_Coords.csv"
    );

    console.log("CSV PATH:", filePath);

    const data = await loadDataset(filePath);

    console.log("Rows loaded:", data.length);
console.log("First row:", data[0]);

    await createKnowledgeGraph(data);

    res.json({ message: "Knowledge graph created successfully 🚀" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};