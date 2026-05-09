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

    console.log("Extracting preferences...");
    const preferences = await extractPreferences(prompt);

    console.log("Searching graph...");
    const packages = await findMatchingPackages(preferences);

    if (!packages.length) {
      return res.json({
        userPrompt: prompt,
        extractedPreferences: preferences,
        packageCount: 0,
        selectedPackage: null,
        itinerary: null,
        userFriendlyResponse: "Sorry, no matching tour package was found for your request.",
      });
    }

    const selectedPackage = packages[0];

    const totalDays = preferences.durationDays || 3;

    //  only use activities according to requested day count
    const limitedActivities = selectedPackage.activities.slice(0, totalDays);

    const itinerary = {
      title: `${totalDays}-Day ${selectedPackage.district} Tour Package`,
      summary: `Stay at ${selectedPackage.hotelName} with ${
        preferences.activityCategory || "selected"
      } activities.`,
      selectedHotel: {
        name: selectedPackage.hotelName,
        district: selectedPackage.district,
        grade: selectedPackage.grade,
        foodType: selectedPackage.foodType,
        category: selectedPackage.hotelCategory,
      },
      dayWisePlan: limitedActivities.map((activity, index) => ({
        day: index + 1,
        activities: [activity.name],
        notes: `${activity.category} activity. Suitable for ${activity.suitableFor}. Price level: ${activity.priceLevel}.`,
      })),
      whyThisPackageMatches: [
        `Located in ${selectedPackage.district}`,
        `Hotel grade matches ${selectedPackage.grade}`,
        `Food preference matches ${preferences.foodType}`,
        `Activities match ${preferences.activityCategory}`,
      ],
    };

    const userFriendlyResponse = `
Here is your ${totalDays}-day ${selectedPackage.district} tour package.

You will stay at ${selectedPackage.hotelName}, a ${selectedPackage.grade} ${selectedPackage.hotelCategory}. This hotel supports ${selectedPackage.foodType} food options, which matches your food preference.

Your trip includes ${preferences.activityCategory || "selected"} activities such as ${limitedActivities
      .map((activity) => activity.name)
      .join(", ")}.

This package was selected because it is located in ${selectedPackage.district}, matches the ${selectedPackage.grade} hotel grade, supports your ${preferences.foodType} food preference, and includes ${
      preferences.activityCategory || "matching"
    } activities.
`.trim();

    console.log("Sending response...");

    return res.json({
      userPrompt: prompt,
      extractedPreferences: preferences,
      packageCount: packages.length,
      selectedPackage,
      itinerary,
      userFriendlyResponse,
    });
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
};