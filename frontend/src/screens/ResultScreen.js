import React, { useState } from "react";
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
import MobileBackButton from "../components/MobileBackButton";


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
      textColor: "#A15B33",
    };
  }

  return {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
    textColor: "#15803D",
  };
};


const formatDuration = (durationMinutes) => {
  const totalMinutes = Number(durationMinutes);

  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "Unavailable";
  }

  const roundedMinutes = Math.round(totalMinutes);

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  return `${hours} h ${minutes} min`;
};


export default function ResultScreen({
  result,
  errorMessage,
  onBack,
  onNewSearch,
  onShowMap,
  onReviewTrip,
}) {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showHistoricalRecords, setShowHistoricalRecords] = useState(false);

  if (!result) {
    return (
      <ScrollView
        style={styles.emptyContainer}
        contentContainerStyle={styles.contentContainer}
      >
        <MobileBackButton onPress={onBack} style={styles.backControl} />

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

  const routeResult = result?.routeResult || null;
  const isRecommendedRoute =
    routeResult?.selectedRouteMode === "lower-risk-recommended";
  const isAnalyzedRoute =
    routeResult?.selectedRouteMode === "default-analyzed-route";
  const comparisonAvailable = Boolean(
    routeResult?.comparisonAvailable && isRecommendedRoute
  );
  const selectedRoute = routeResult;
  const normalizedRiskLevel = String(riskLevel).toLowerCase();
  const riskMessage = normalizedRiskLevel === "high"
    ? "Several historical safety concerns were identified. Extra caution is recommended."
    : normalizedRiskLevel === "medium"
      ? "Some safety concerns were identified. Travel with additional care."
      : normalizedRiskLevel === "low"
        ? "This route has a relatively low historical safety risk."
        : "Route safety information is currently limited.";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <MobileBackButton onPress={onBack} style={styles.backControl} />


      <View style={styles.hero}>
        <Text style={styles.title}>Your safer trip plan</Text>
        <Text style={styles.subtitle}>
          Clear route safety guidance and a suitable vehicle recommendation for your journey.
        </Text>
      </View>


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
          Route Safety Level
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

        <Text style={styles.riskMessage}>{riskMessage}</Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>
          {isRecommendedRoute
            ? "Recommended Lower-Risk Route"
            : "Analyzed Route"}
        </Text>

        {selectedRoute ? (
          <>
            <Text style={styles.text}>From: {selectedRoute.startLocation}</Text>
            <Text style={styles.text}>To: {selectedRoute.endLocation}</Text>
            <Text style={styles.text}>Distance: {selectedRoute.distanceKm} km</Text>
            <Text style={styles.text}>Duration: {formatDuration(selectedRoute.durationMinutes)}</Text>
            {comparisonAvailable && (
              <Text style={styles.text}>
                Compared with fastest route: {result?.comparison?.extraMinutesVsFastest ?? 0} mins, {result?.comparison?.extraDistanceKmVsFastest ?? 0} km
              </Text>
            )}
            {isAnalyzedRoute && (
              <Text style={styles.noticeText}>
                Alternative lower-risk comparison unavailable.
              </Text>
            )}
            {!selectedRoute.vehicleUsesSelectedRoute && (
              <Text style={styles.contextNote}>
                Route-specific vehicle evidence is unavailable.
              </Text>
            )}
            {selectedRoute.routeGeometryAvailable ? (
              <TouchableOpacity style={styles.button} onPress={() => onShowMap(selectedRoute)}>
                <Text style={styles.buttonText}>Show Route Map</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.contextNote}>Route geometry is unavailable.</Text>
            )}
          </>
        ) : (
          <Text style={styles.noticeText}>
            Route analysis is unavailable.
          </Text>
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
          {formatDuration(result?.trip?.durationMinutes)}
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

      </View>


      {/* -----------------------------------------
          VEHICLE RECOMMENDATION
      ----------------------------------------- */}

      <Text style={styles.sectionTitle}>
        Vehicle Recommendation for {comparisonAvailable
          ? "Recommended Route"
          : "Analyzed Route"}
      </Text>

      <Text style={styles.contextNote}>
        {routeResult?.vehicleUsesSelectedRoute
          ? `Vehicle recommendation is based on the road context of the ${comparisonAvailable ? "recommended evaluated" : "analyzed"} route.`
          : result?.vehicleIntegration?.limitation ||
            "Route-specific vehicle evidence is unavailable."}
      </Text>


      {bestVehicle ? (
        <VehicleCard
          title="Best Vehicle Match"
          vehicle={bestVehicle}
          showTechnicalDetails={showTechnicalDetails}
          onSelect={(vehicle) => onReviewTrip(vehicle, result)}
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

      {showTechnicalDetails && vehicleExplanation && (
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
            showTechnicalDetails={showTechnicalDetails}
            onSelect={(selectedVehicle) => onReviewTrip(selectedVehicle, result)}
          />
        )
      )}


      {result?.safetyUpsell && (
        <>
          <VehicleCard
            title="Higher Road-Capability Option"
            vehicle={result.safetyUpsell}
            showTechnicalDetails={showTechnicalDetails}
            onSelect={(vehicle) => onReviewTrip(vehicle, result)}
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
          Why is this route {String(riskLevel).toLowerCase()} risk?
        </Text>

        <Text style={styles.text}>
          {result?.graphRAG?.explanation ||
            "No historical explanation is available."}
        </Text>

        <Text style={styles.riskCount}>
          Historical Risk Records Found:{" "}
          {result?.graphRAG?.riskCount || 0}
        </Text>

      </View>

      {(result?.graphRAG?.matchedRisks?.length || 0) > 0 && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowHistoricalRecords(!showHistoricalRecords)}
        >
          <Text style={styles.secondaryButtonText}>
            {showHistoricalRecords
              ? "Hide historical records"
              : `View all ${result.graphRAG.matchedRisks.length} historical records`}
          </Text>
        </TouchableOpacity>
      )}

      {showHistoricalRecords && result?.graphRAG?.matchedRisks?.map(
        (risk, index) => (
          <RiskCard
            key={risk?.riskId || `risk-${index}`}
            risk={risk}
          />
        )
      )}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => setShowTechnicalDetails(!showTechnicalDetails)}
      >
        <Text style={styles.secondaryButtonText}>
          {showTechnicalDetails ? "Hide technical details" : "View technical details"}
        </Text>
      </TouchableOpacity>

      {showTechnicalDetails && (
        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Technical Details</Text>
          <Text style={styles.text}>Model: {riskPrediction?.modelName || "Unknown"}</Text>
          <Text style={styles.text}>Prediction scope: {riskPrediction?.predictionScope || "Route-level risk classification"}</Text>
          <Text style={styles.text}>Prediction confidence: {confidence ?? "Unavailable"}{confidence != null ? "%" : ""}</Text>
          <Text style={styles.contextNote}>
            This is confidence for this prediction, not the overall accuracy of the system.
          </Text>
          <Text style={styles.text}>Evidence status: {selectedRoute?.evidenceStatus || "Unavailable"}</Text>
          <Text style={styles.text}>Graph match type: {result?.graphRAG?.matchType || "Unknown"}</Text>
          <Text style={styles.text}>Matched road: {result?.analysis?.matchedRoad || "Unavailable"}</Text>
          <Text style={styles.text}>Gradient: {result?.analysis?.gradient ?? "Unavailable"}{result?.analysis?.gradient != null ? "%" : ""}</Text>
          <Text style={styles.text}>Terrain: {result?.analysis?.terrain || "Unknown"}</Text>
          <Text style={styles.text}>Road surface: {result?.analysis?.roadSurface || "Unknown"}</Text>
          {Object.keys(probabilities).length > 0 && (
            <View style={styles.probabilityBox}>
              <Text style={styles.probabilityTitle}>Class Probabilities</Text>
              <Text style={styles.probabilityText}>Low: {(Number(probabilities.Low || 0) * 100).toFixed(1)}%</Text>
              <Text style={styles.probabilityText}>Medium: {(Number(probabilities.Medium || 0) * 100).toFixed(1)}%</Text>
              <Text style={styles.probabilityText}>High: {(Number(probabilities.High || 0) * 100).toFixed(1)}%</Text>
            </View>
          )}
        </View>
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
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 48,
  },

  backControl: {
    marginTop: 10,
    marginBottom: 16,
  },

  title: {
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "600",
    fontFamily: "serif",
    color: "#FFFFFF",
    marginTop: 13,
  },

  subtitle: {
    fontSize: 15,
    color: "#E7DBBA",
    marginTop: 8,
    lineHeight: 22,
  },
  hero: {
    backgroundColor: colors.primaryDark,
    borderRadius: 26,
    padding: 25,
    marginBottom: 16,
  },
  heroBadge: {
    alignSelf: "flex-start",
    color: "#D89A1F",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
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

  riskMessage: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
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
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "serif",
    color: colors.text,
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: "600",
    fontFamily: "serif",
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
    backgroundColor: "#F1E9D2",
    borderColor: colors.border,
    borderWidth: 1,
    padding: 16,
    borderRadius: 20,
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
    backgroundColor: "#E7DBBA",
    borderWidth: 1,
    borderColor: "#C9B98F",
    borderRadius: 18,
    padding: 18,
    marginTop: 22,
  },

  graphTitle: {
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "serif",
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

  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
    marginTop: 14,
  },

  secondaryButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "800",
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
