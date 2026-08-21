import React from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
} from "react-native";

import { colors } from "../styles/colors";
import VehicleCard from "../components/VehicleCard";
import RiskCard from "../components/RiskCard";


const getRiskStyle = (riskLevel) => {
  const risk = String(
    riskLevel || ""
  ).toLowerCase();

  if (risk === "high") {
    return {
      backgroundColor: "#FEF2F2",
      borderColor: "#FCA5A5",
      textColor: "#B91C1C",
    };
  }

  if (risk === "medium") {
    return {
      backgroundColor: "#FFFBEB",
      borderColor: "#FCD34D",
      textColor: "#B45309",
    };
  }

  return {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
    textColor: "#15803D",
  };
};


export default function ResultScreen({
  result,
  errorMessage,
  onBack,
  onNewSearch,
}) {
  if (!result) {
    return (
      <ScrollView
        style={styles.emptyContainer}
        contentContainerStyle={styles.contentContainer}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>
            ← Back
          </Text>
        </TouchableOpacity>

        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            No Recommendation Found
          </Text>

          <Text style={styles.errorText}>
            {errorMessage ||
              "The system could not generate a vehicle recommendation for this trip."}
          </Text>

          <TouchableOpacity
            style={styles.button}
            onPress={onBack}
          >
            <Text style={styles.buttonText}>
              Back to Form
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }


  const riskPrediction =
    result?.riskPrediction || {};

  const riskLevel =
    riskPrediction?.riskLevel ||
    "Unknown";

  const riskStyle =
    getRiskStyle(riskLevel);

  const confidence =
    riskPrediction?.confidencePercent;

  const probabilities =
    riskPrediction?.probabilities || {};

  const explanation =
    result?.explanation || {};

  const riskExplanation =
    explanation?.risk || {};

  const vehicleExplanation =
    explanation?.vehicleRecommendation ||
    null;

  const upsellExplanation =
    explanation?.safetyUpsell ||
    null;

  const bestVehicle =
    result?.bestVehicle ||
    result?.bestSafetyMatch ||
    null;


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backText}>
          ← Back
        </Text>
      </TouchableOpacity>


      <Text style={styles.title}>
        Recommendation Result
      </Text>

      <Text style={styles.subtitle}>
        Route-level ML risk classification with historical
        Neo4j safety evidence.
      </Text>


      {/* -----------------------------------------
          ROUTE RISK
      ----------------------------------------- */}

      <View
        style={[
          styles.riskPredictionCard,
          {
            backgroundColor:
              riskStyle.backgroundColor,

            borderColor:
              riskStyle.borderColor,
          },
        ]}
      >
        <Text style={styles.sectionLabel}>
          Predicted Route Risk
        </Text>

        <Text
          style={[
            styles.riskLevel,
            {
              color:
                riskStyle.textColor,
            },
          ]}
        >
          {riskLevel}
        </Text>

        {confidence !== undefined &&
          confidence !== null && (
            <Text style={styles.confidence}>
              Model Confidence:{" "}
              {confidence}%
            </Text>
          )}

        <Text style={styles.modelText}>
          {riskExplanation?.confidenceInterpretation ||
            riskPrediction?.confidenceInterpretation ||
            "Model confidence is the classifier's predicted-class probability, not a real-world accident probability."}
        </Text>

        <Text style={styles.modelText}>
          Model:{" "}
          {riskPrediction?.modelName ||
            "Unknown"}
        </Text>

        <Text style={styles.modelText}>
          Prediction Scope:{" "}
          {riskPrediction?.predictionScope ||
            "Route-level risk classification"}
        </Text>


        {Object.keys(probabilities).length > 0 && (
          <View style={styles.probabilityBox}>
            <Text style={styles.probabilityTitle}>
              Class Probabilities
            </Text>

            <Text style={styles.probabilityText}>
              Low:{" "}
              {(
                Number(
                  probabilities.Low || 0
                ) * 100
              ).toFixed(1)}
              %
            </Text>

            <Text style={styles.probabilityText}>
              Medium:{" "}
              {(
                Number(
                  probabilities.Medium || 0
                ) * 100
              ).toFixed(1)}
              %
            </Text>

            <Text style={styles.probabilityText}>
              High:{" "}
              {(
                Number(
                  probabilities.High || 0
                ) * 100
              ).toFixed(1)}
              %
            </Text>
          </View>
        )}
      </View>


      {/* -----------------------------------------
          TRIP SUMMARY
      ----------------------------------------- */}

      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>
          Trip Summary
        </Text>

        <Text style={styles.text}>
          From: {result?.trip?.from}
        </Text>

        <Text style={styles.text}>
          To: {result?.trip?.to}
        </Text>

        <Text style={styles.text}>
          Distance:{" "}
          {result?.trip?.distanceKm} km
        </Text>

        <Text style={styles.text}>
          Duration:{" "}
          {result?.trip?.durationMinutes} mins
        </Text>

        <Text style={styles.text}>
          Matched Road:{" "}
          {result?.analysis?.matchedRoad}
        </Text>

        <Text style={styles.text}>
          Gradient:{" "}
          {result?.analysis?.gradient ?? "Unavailable"}
          {result?.analysis?.gradient !== null &&
            result?.analysis?.gradient !== undefined
            ? "%"
            : ""}
        </Text>

        <Text style={styles.text}>
          Terrain:{" "}
          {result?.analysis?.terrain}
        </Text>

        <Text style={styles.text}>
          Road Surface:{" "}
          {result?.analysis?.roadSurface}
        </Text>

        <Text style={styles.text}>
          Weather:{" "}
          {result?.analysis?.weather ||
            "Unavailable"}
        </Text>

        <Text style={styles.text}>
          Temperature:{" "}
          {result?.analysis?.temperature ?? "N/A"} °C
        </Text>

        <Text style={styles.text}>
          Rain Detected:{" "}
          {result?.analysis?.rainDetected === null
            ? "Unavailable"
            : result?.analysis?.rainDetected
              ? "Yes"
              : "No"}
        </Text>

        <Text style={styles.contextNote}>
          Weather is current trip context and is not an input
          to the risk classifier.
        </Text>
      </View>


      {/* -----------------------------------------
          VEHICLE RECOMMENDATION
      ----------------------------------------- */}

      <Text style={styles.sectionTitle}>
        Vehicle Recommendation
      </Text>


      {bestVehicle ? (
        <VehicleCard
          title="Best Vehicle Match"
          vehicle={bestVehicle}
        />
      ) : (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>
            No Vehicle Within Current Filters
          </Text>

          <Text style={styles.noticeText}>
            No vehicle matched the current budget,
            passenger count, preferred category and
            road-gradient requirements.
          </Text>
        </View>
      )}

      {vehicleExplanation && (
        <View style={styles.explanationCard}>
          <Text style={styles.explanationTitle}>
            Why This Vehicle
          </Text>

          <Text style={styles.text}>
            {vehicleExplanation.reason}
          </Text>

          {vehicleExplanation?.ranking?.criteria && (
            <Text style={styles.contextNote}>
              Ranking for {vehicleExplanation.ranking.riskLevel} risk:
              {" "}
              {vehicleExplanation.ranking.criteria.join(
                ", then "
              )}.
            </Text>
          )}
        </View>
      )}


      {result?.alternativeOptions?.map(
        (vehicle, index) => (
          <VehicleCard
            key={`alternative-${index}`}
            title={`Alternative Option ${index + 1}`}
            vehicle={vehicle}
          />
        )
      )}


      {result?.safetyUpsell && (
        <>
          <VehicleCard
            title="Higher Road-Capability Option"
            vehicle={result.safetyUpsell}
          />

          {upsellExplanation?.reason && (
            <View style={styles.explanationCard}>
              <Text style={styles.explanationTitle}>
                Why This Option Is Shown
              </Text>

              <Text style={styles.text}>
                {upsellExplanation.reason}
              </Text>
            </View>
          )}
        </>
      )}

      {!result?.safetyUpsell &&
        upsellExplanation?.reason && (
          <Text style={styles.contextNote}>
            {upsellExplanation.reason}
          </Text>
        )}


      {/* -----------------------------------------
          NEO4J REASONING
      ----------------------------------------- */}

      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>
          Historical Safety Reasoning
        </Text>

        <Text style={styles.text}>
          {result?.graphRAG?.explanation ||
            "No historical explanation is available."}
        </Text>

        <Text style={styles.riskCount}>
          Historical Risk Records Found:{" "}
          {result?.graphRAG?.riskCount || 0}
        </Text>

        <Text style={styles.graphMeta}>
          Graph Match Type:{" "}
          {result?.graphRAG?.matchType ||
            "Unknown"}
        </Text>

        <Text style={styles.graphMeta}>
          Historical graph context supports retrieval and may
          populate named model inputs when available; it does not
          independently override the classifier result.
        </Text>
      </View>


      {result?.graphRAG?.matchedRisks?.map(
        (risk, index) => (
          <RiskCard
            key={
              risk?.riskId ||
              `risk-${index}`
            }
            risk={risk}
          />
        )
      )}


      <TouchableOpacity
        style={styles.button}
        onPress={onNewSearch}
      >
        <Text style={styles.buttonText}>
          New Search
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
  },

  emptyContainer: {
    backgroundColor: colors.background,
    flex: 1,
  },

  contentContainer: {
    padding: 20,
  },

  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 16,
  },

  title: {
    fontSize: 30,
    fontWeight: "bold",
    color: colors.primaryDark,
  },

  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 22,
  },

  riskPredictionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },

  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 6,
  },

  riskLevel: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 6,
  },

  confidence: {
    fontSize: 17,
    color: colors.text,
    fontWeight: "700",
    marginBottom: 8,
  },

  modelText: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 4,
  },

  probabilityBox: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  probabilityTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 7,
  },

  probabilityText: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 3,
  },

  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.primaryDark,
    marginTop: 20,
    marginBottom: 2,
  },

  text: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 7,
    lineHeight: 22,
  },

  noticeCard: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    padding: 18,
    borderRadius: 16,
    marginTop: 14,
  },

  noticeTitle: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#9A3412",
    marginBottom: 7,
  },

  noticeText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 21,
  },

  explanationCard: {
    backgroundColor: "#F8FAFC",
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    borderRadius: 16,
    marginTop: 14,
  },

  explanationTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primaryDark,
    marginBottom: 7,
  },

  contextNote: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginTop: 6,
  },

  graphCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 18,
    padding: 18,
    marginTop: 22,
  },

  graphTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.primaryDark,
    marginBottom: 10,
  },

  riskCount: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: colors.warning,
  },

  graphMeta: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 13,
  },

  errorCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 20,
    marginTop: 20,
  },

  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primaryDark,
    marginBottom: 12,
  },

  errorText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 12,
  },

  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 28,
    marginBottom: 40,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
});
