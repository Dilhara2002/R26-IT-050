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
  if (!result) {
    return (
      <View style={styles.emptyContainer}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>No Recommendation Found</Text>

          <Text style={styles.errorText}>
            {errorMessage ||
              "The system could not generate a vehicle recommendation for this trip."}
          </Text>

          <Text style={styles.errorReason}>
            Possible reasons: invalid route, no matching road segment, no suitable
            vehicle for the selected budget/passengers, or backend prediction error.
          </Text>

          <TouchableOpacity style={styles.button} onPress={onBack}>
            <Text style={styles.buttonText}>Back to Form</Text>
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

      <Text style={styles.title}>Recommendation Result</Text>
      <Text style={styles.subtitle}>
        ML prediction enhanced with Neo4j GraphRAG reasoning.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Trip Summary</Text>

        <Text style={styles.text}>From: {result?.trip?.from}</Text>
        <Text style={styles.text}>To: {result?.trip?.to}</Text>
        <Text style={styles.text}>Distance: {result?.trip?.distanceKm} km</Text>
        <Text style={styles.text}>
          Duration: {result?.trip?.durationMinutes} mins
        </Text>
        <Text style={styles.text}>
          Matched Road: {result?.analysis?.matchedRoad}
        </Text>
        <Text style={styles.text}>Weather: {result?.analysis?.weather}</Text>
      </View>

      <VehicleCard title="Best Safety Match" vehicle={result?.bestSafetyMatch} />

      {result?.alternativeOptions?.map((vehicle, index) => (
        <VehicleCard
          key={index}
          title={`Alternative Option ${index + 1}`}
          vehicle={vehicle}
        />
      ))}

      <View style={styles.graphCard}>
        <Text style={styles.graphTitle}>GraphRAG Safety Reasoning</Text>

        <Text style={styles.text}>{result?.graphRAG?.explanation}</Text>

        <Text style={styles.riskCount}>
          Risk Records Found: {result?.graphRAG?.riskCount || 0}
        </Text>
      </View>

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
  text: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 7,
    lineHeight: 22,
  },
  graphCard: {
    backgroundColor: "#F0FDFA",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
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
    marginTop: 28,
    marginBottom: 40,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
});