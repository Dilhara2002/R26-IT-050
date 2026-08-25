import path from "path";
import { fileURLToPath } from "url";
import { loadDataset } from "../services/csv.service.js";
import { createKnowledgeGraph } from "../services/hotelGraph.service.js";
import { createActivityGraph } from "../services/activityGraph.service.js";
import { extractPreferences } from "../services/llm/extractor.service.js";
import { findMatchingPackages } from "../services/package.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const buildGraphFromDataset = async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../data/SLTDA_Master_Dataset_Updated_Coords.csv"
    );

    console.log("Hotel CSV path:", filePath);

    const data = await loadDataset(filePath);

    console.log("Hotel rows loaded:", data.length);
    console.log("First hotel row:", data[0]);

    await createKnowledgeGraph(data);

    return res.json({
      message: "Hotel knowledge graph created successfully",
      rows: data.length,
    });
  } catch (error) {
    console.error("Hotel graph error:", error);

    return res.status(500).json({
      error: error.message,
    });
  }
};

export const buildActivityGraph = async (req, res) => {
  try {
    const filePath = path.join(
      __dirname,
      "../data/Activities-Rag.csv"
    );

    console.log("Activity CSV path:", filePath);

    const data = await loadDataset(filePath);

    console.log("Activities loaded:", data.length);
    console.log("First activity:", data[0]);

    await createActivityGraph(data);

    return res.json({
      message: "Activity graph created successfully",
      rows: data.length,
    });
  } catch (error) {
    console.error("Activity graph error:", error);

    return res.status(500).json({
      error: error.message,
    });
  }
};

export const generatePackageFromPrompt = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "A non-empty prompt is required",
      });
    }

    console.log("Extracting preferences...");

    const preferences = await extractPreferences(prompt.trim());

    console.log("Extracted preferences:", preferences);
    console.log("Searching for the top three hotels...");

    const packages = await findMatchingPackages(preferences);

    if (!packages.length) {
      return res.json({
        userPrompt: prompt,
        extractedPreferences: preferences,
        recommendationCount: 0,
        recommendations: [],
        userFriendlyResponse:
          "Sorry, no matching hotels or tour packages were found for your request.",
      });
    }

    const totalDays =
      Number.isInteger(preferences.durationDays) &&
      preferences.durationDays > 0
        ? preferences.durationDays
        : 3;

    const recommendations = packages.map((hotelPackage, index) => {
      /*
       * Activities returned from Neo4j for THIS hotel.
       *
       * IMPORTANT:
       * These activities must also be included in the final recommendation
       * response. Previously they were used to build the itinerary but were
       * not included in recommendations[], which caused the frontend
       * activities to disappear after moving from selectedPackage to the
       * top-three recommendation structure.
       */
      const availableActivities = Array.isArray(
        hotelPackage.activities
      )
        ? hotelPackage.activities
        : [];

      /*
       * Keep the full activity list for displaying under the hotel.
       *
       * Only the itinerary is limited according to the number of trip days.
       * Example:
       *
       * 7 matching activities may be displayed for the hotel,
       * while a 3-day trip uses 3 of them for the suggested day plan.
       */
      const itineraryActivities = availableActivities.slice(
        0,
        totalDays
      );

      const dayWisePlan = Array.from(
        { length: totalDays },
        (_, dayIndex) => {
          const activity =
            itineraryActivities.length > 0
              ? itineraryActivities[
                  dayIndex % itineraryActivities.length
                ]
              : null;

          if (!activity) {
            return {
              day: dayIndex + 1,
              activities: [],
              notes: "Free day at the hotel.",
            };
          }

          return {
            day: dayIndex + 1,

            activities: [activity.name],

            notes: [
              `${activity.category || "Selected"} activity.`,

              `Suitable for ${
                activity.suitableFor || "all visitors"
              }.`,

              `Price level: ${
                activity.priceLevel || "not specified"
              }.`,

              activity.durationHours
                ? `Estimated duration: ${activity.durationHours} hours.`
                : null,
            ]
              .filter(Boolean)
              .join(" "),
          };
        }
      );

      const matchingActivityCount =
        Number(hotelPackage.activityMatchCount) ||
        availableActivities.length;

      return {
        rank: index + 1,

        matchScore: {
          matchingActivityCount,
        },

        hotel: {
          id: hotelPackage.hotelId,
          name: hotelPackage.hotelName,
          district: hotelPackage.district,
          grade: hotelPackage.grade,
          foodType: hotelPackage.foodType,
          category: hotelPackage.hotelCategory,
          rooms: hotelPackage.rooms,
          latitude: hotelPackage.hotelLatitude,
          longitude: hotelPackage.hotelLongitude,
        },

        /*
         * RESTORED:
         *
         * This is the important field that was missing from the new
         * recommendations[] response.
         *
         * Frontend should read:
         *
         * recommendation.activities
         */
        activities: availableActivities,

        itinerary: {
          title: `${totalDays}-Day ${hotelPackage.district} Tour Package`,

          summary:
            `Stay at ${hotelPackage.hotelName} and enjoy ` +
            `${
              preferences.activityCategory || "selected"
            } activities.`,

          dayWisePlan,

          whyThisPackageMatches: [
            `Located in ${hotelPackage.district}`,

            `Hotel grade: ${
              hotelPackage.grade || "not specified"
            }`,

            `Hotel category: ${
              hotelPackage.hotelCategory || "not specified"
            }`,

            `Food options: ${
              hotelPackage.foodType || "not specified"
            }`,

            `Matching activities: ${matchingActivityCount}`,
          ],
        },
      };
    });

    const hotelNames = recommendations
      .map(
        (recommendation) =>
          `${recommendation.rank}. ${recommendation.hotel.name}`
      )
      .join(", ");

    const userFriendlyResponse =
      `Here are the top ${recommendations.length} matching hotels ` +
      `for your ${totalDays}-day trip to ` +
      `${
        preferences.district || "Sri Lanka"
      }: ${hotelNames}.`;

    console.log("Sending top hotel recommendations...");

    /*
     * Helpful development logging.
     *
     * This allows us to confirm whether activities are already present
     * before the response reaches the frontend.
     */
    recommendations.forEach((recommendation) => {
      console.log(
        `Hotel #${recommendation.rank}:`,
        recommendation.hotel.name,
        "| Activities:",
        recommendation.activities.length
      );
    });

    return res.json({
      userPrompt: prompt,
      extractedPreferences: preferences,
      recommendationCount: recommendations.length,
      recommendations,
      userFriendlyResponse,
    });
  } catch (error) {
    console.error("Package generation error:", error);

    return res.status(500).json({
      error: error.message,
    });
  }
};