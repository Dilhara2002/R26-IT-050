/**
 * Screen: ResultScreen
 * Branch: safety-analyzer-Graphrag
 * Purpose: Displays GraphRAG-based safety recommendations and historical road hazards.
 */

import React from "react";
import { ScrollView, Text, TouchableOpacity, StyleSheet, View } from "react-native";
import { colors } from "../styles/colors";
import VehicleCard from "../components/VehicleCard";
import RiskCard from "../components/RiskCard";

export default function ResultScreen({
  result,
  errorMessage,
  onBack,
  onNewSearch,
}) {
  // --- Error State (When no road data or graph context is found) ---
  if (!result) {
    return (
      <View style={styles.emptyContainer}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Analysis Unavailable</Text>

          <Text style={styles.errorText}>
            {errorMessage ||
              "The Knowledge Graph could not find relevant safety context for this specific route."}
          </Text>

          <Text style={styles.errorReason}>
            Possible reasons: The route is not yet indexed in Neo4j, or the locations provided could not be mapped to existing road segments.
          </Text>

          <TouchableOpacity style={styles.button} onPress={onBack}>
            <Text style={styles.buttonText}>Return to Form</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Safety Analysis</Text>
      <Text style={styles.subtitle}>
        Historical road hazard reasoning powered by Neo4j GraphRAG.
      </Text>

      {/* --- Trip Summary Section --- */}
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Route Overview</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Route Path:</Text>
          <Text style={styles.value}>{result?.trip?.from} to {result?.trip?.to}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Total Distance:</Text>
          <Text style={styles.value}>{result?.trip?.distanceKm} km</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Matched Road:</Text>
          <Text style={styles.value}>{result?.analysis?.matchedRoad || "N/A"}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Terrain Type:</Text>
          <Text style={styles.value}>{result?.analysis?.terrain || "N/A"}</Text>
        </View>
      </View>

      {/* --- Main Recommendation --- */}
      <VehicleCard title="Primary Recommendation" vehicle={result?.bestSafetyMatch} />

      {/* --- Alternative Options --- */}
      {result?.alternativeOptions?.map((vehicle, index) => (
        <VehicleCard
          key={index}
          title={`Alternative ${index + 1}`}
          vehicle={vehicle}
        />
      ))}

      {/* --- GraphRAG Detailed Reasoning --- */}
      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>Knowledge Graph Insights</Text>

        <Text style={styles.explanationText}>
          {result?.graphRAG?.explanation || "Analyzing historical patterns..."}
        </Text>

        <View style={styles.badgeContainer}>
          <Text style={styles.riskCount}>
             Historical Records Found: {result?.graphRAG?.riskCount || 0}
          </Text>
        </View>
      </View>

      {/* --- Individual Risk Cards (from Neo4j Nodes) --- */}
      {result?.graphRAG?.matchedRisks?.map((risk, index) => (
        <RiskCard key={index} risk={risk} />
      ))}

      <TouchableOpacity style={styles.button} onPress={onNewSearch}>
        <Text style={styles.buttonText}>New Search</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
    flex: 1,
  },
  emptyContainer: {
    backgroundColor: colors.background,
    padding: 20,
    flex: 1,
    justifyContent: "center",
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primaryDark,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginTop: 6,
    marginBottom: 24,
    lineHeight: 22,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: "500",
  },
  value: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 10,
  },
  graphCard: {
    backgroundColor: "#F0FDFA", // Light teal background
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
  },
  graphTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primaryDark,
    marginBottom: 10,
  },
  explanationText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
  },
  badgeContainer: {
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#CCFBF1",
  },
  riskCount: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.warning,
  },
  errorCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.danger,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  errorReason: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 30,
    marginBottom: 50,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
});