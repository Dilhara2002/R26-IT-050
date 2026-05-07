import path from "path";
import { fileURLToPath } from "url";
import { loadDataset } from "../services/csv.service.js";
import { createKnowledgeGraph } from "../services/hotelGraph.service.js";
import { createActivityGraph } from "../services/activityGraph.service.js";
import { extractPreferences } from "../services/llm/extractor.service.js";
import { findMatchingPackages } from "../services/package.service.js";
import { generateItineraryText } from "../services/llm/itineraryGenerator.service.js";

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

    res.json({
      message: "Hotel knowledge graph created successfully 🚀",
      rows: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

export const buildActivityGraph = async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../data/activities_2000_graph_rag.csv"
    );

    console.log("ACTIVITY CSV PATH:", filePath);

    const data = await loadDataset(filePath);

    console.log("Activities loaded:", data.length);
    console.log("First activity:", data[0]);

    await createActivityGraph(data);

    res.json({
      message: "Activity graph created successfully 🚀",
      rows: data.length,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};

export const generatePackageFromPrompt = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    const preferences = await extractPreferences(prompt);

    const packages = await findMatchingPackages(preferences);

    if (!packages.length) {
      return res.json({
        userPrompt: prompt,
        extractedPreferences: preferences,
        packageCount: 0,
        packages: [],
        itinerary: null,
        message: "No matching package found for the given preferences.",
      });
    }

    const itinerary = await generateItineraryText({
      prompt,
      preferences,
      packages,
    });

    res.json({
      userPrompt: prompt,
      extractedPreferences: preferences,
      packageCount: packages.length,
      packages,
      itinerary,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};