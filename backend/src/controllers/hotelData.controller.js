import path from "path";
import { fileURLToPath } from "url";
import { loadDataset } from "../services/csv.service.js";
import { createKnowledgeGraph } from "../services/hotelGraph.service.js";
import { createActivityGraph } from "../services/activityGraph.service.js";
import { extractPreferences } from "../services/llm/extractor.service.js";
import {
  findHotelById,
  findMatchingPackages,
} from "../services/package.service.js";
import {
  getHotelPrice,
  validateStayRequest,
} from "../services/liteApiHotelPricing.service.js";

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
    const { prompt, stay } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    const stayValidation = stay === undefined ? null : validateStayRequest(stay);
    if (stayValidation && !stayValidation.valid) {
      return res.status(400).json({ error: stayValidation.error });
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

    const totalDays = preferences.durationDays || 3;

    const topPackages = [...packages]
      .sort((left, right) => {
        const activityDifference =
          (right.activities?.length || 0) - (left.activities?.length || 0);
        if (activityDifference) return activityDifference;
        return Number(right.rooms || 0) - Number(left.rooms || 0);
      })
      .slice(0, 3);

    const recommendations = topPackages.map((hotelPackage, index) => {
      const activities = Array.isArray(hotelPackage.activities)
        ? hotelPackage.activities
        : [];
      const limitedActivities = activities.slice(0, totalDays);
      const itinerary = {
        title: `${totalDays}-Day ${hotelPackage.district} Tour Package`,
        summary: `Stay at ${hotelPackage.hotelName} with ${
          preferences.activityCategory || "selected"
        } activities.`,
        dayWisePlan: Array.from({ length: totalDays }, (_, dayIndex) => {
          const activity = limitedActivities[dayIndex % limitedActivities.length];
          return {
            day: dayIndex + 1,
            activities: activity ? [activity.name] : [],
            notes: activity
              ? `${activity.category} activity. Suitable for ${activity.suitableFor}. Price level: ${activity.priceLevel}.`
              : "Free day at the hotel.",
          };
        }),
      };

      return {
        rank: index + 1,
        matchScore: { matchingActivityCount: activities.length },
        hotel: {
          id: hotelPackage.hotelId,
          name: hotelPackage.hotelName,
          district: hotelPackage.district,
          grade: hotelPackage.grade,
          foodType: hotelPackage.foodType,
          category: hotelPackage.hotelCategory,
          rooms: hotelPackage.rooms,
        },
        activities,
        itinerary,
      };
    });

    const first = recommendations[0];
    const userFriendlyResponse =
      `Here are the top ${recommendations.length} hotel matches for your ` +
      `${totalDays}-day ${preferences.district || first.hotel.district} trip. ` +
      "Select a hotel to retrieve its room price for your complete stay.";

    console.log("Sending response...");

    return res.json({
      userPrompt: prompt,
      extractedPreferences: preferences,
      packageCount: packages.length,
      recommendationCount: recommendations.length,
      recommendations,
      stay: stayValidation?.value || null,
      selectedPackage: topPackages[0],
      itinerary: first.itinerary,
      userFriendlyResponse,
    });
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
};

export const priceSelectedHotel = async (req, res) => {
  try {
    const { hotelId, stay } = req.body || {};
    if (typeof hotelId !== "string" || !hotelId.trim()) {
      return res.status(400).json({ error: "hotelId is required." });
    }

    const stayValidation = validateStayRequest(stay);
    if (!stayValidation.valid) {
      return res.status(400).json({ error: stayValidation.error });
    }

    const hotel = await findHotelById(hotelId.trim());
    if (!hotel) {
      return res.status(404).json({ error: "Selected hotel was not found." });
    }

    const hotelPricing = await getHotelPrice(hotel, stayValidation.value);
    return res.json({ hotelId: hotel.hotelId, hotelPricing });
  } catch (error) {
    console.error("HOTEL_PRICE_ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
};
