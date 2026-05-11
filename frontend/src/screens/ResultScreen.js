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

export default function ResultScreen({
  result,
  errorMessage,
  onBack,
  onNewSearch,
}) {
  if (!result) {
    return (
      <View style={styles.page}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>
            No Vehicle Recommendation Found
          </Text>

          <Text style={styles.errorText}>
            {errorMessage ||
              "The system could not generate a vehicle suggestion for this trip."}
          </Text>

          <Text style={styles.errorReason}>
            Please check your route, budget, passenger count or try again with
            different inputs.
          </Text>

          <TouchableOpacity style={styles.button} onPress={onBack}>
            <Text style={styles.buttonText}>Back to Form</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>

      {/* HEADER */}
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🚘</Text>
        <Text style={styles.title}>Vehicle Recommendation</Text>
        <Text style={styles.subtitle}>
          AI-powered smart vehicle matching based on your trip details.
        </Text>
      </View>

      {/* TRIP SUMMARY */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trip Summary</Text>

        <Text style={styles.text}>From: {result?.trip?.from}</Text>
        <Text style={styles.text}>To: {result?.trip?.to}</Text>
        <Text style={styles.text}>
          Distance: {result?.trip?.distanceKm} km
        </Text>
        <Text style={styles.text}>
          Duration: {result?.trip?.durationMinutes} mins
        </Text>
        <Text style={styles.text}>
          Matched Road: {result?.analysis?.matchedRoad}
        </Text>
        <Text style={styles.text}>
          Weather: {result?.analysis?.weather}
        </Text>
      </View>

      {/* BEST MATCH */}
      <VehicleCard
        title="Best Recommended Vehicle"
        vehicle={result?.bestSafetyMatch}
      />

      {/* ALTERNATIVES */}
      {result?.alternativeOptions?.map((vehicle, index) => (
        <VehicleCard
          key={index}
          title={`Alternative Option ${index + 1}`}
          vehicle={vehicle}
        />
      ))}

      {/* RISK SECTION */}
      <View style={styles.riskCard}>
        <Text style={styles.riskTitle}>Risk Analysis</Text>

        <Text style={styles.text}>
          Risk Records Found: {result?.graphRAG?.riskCount || 0}
        </Text>
      </View>

      {result?.graphRAG?.matchedRisks?.map((risk, index) => (
        <RiskCard key={index} risk={risk} />
      ))}

      {/* NEW SEARCH BUTTON */}
      <TouchableOpacity style={styles.button} onPress={onNewSearch}>
        <Text style={styles.buttonText}>New Vehicle Search</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#EAF2FF",
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 26,
    padding: 22,
    marginBottom: 18,
    alignItems: "center",
  },

  heroIcon: {
    fontSize: 50,
    marginBottom: 8,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },

  subtitle: {
    color: "#DBEAFE",
    textAlign: "center",
    marginTop: 8,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    elevation: 3,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 10,
    color: "#0F172A",
  },

  text: {
    fontSize: 14,
    color: "#334155",
    marginBottom: 6,
  },

  riskCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    padding: 16,
    marginTop: 16,
  },

  riskTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
    color: "#0F172A",
  },

  errorCard: {
    backgroundColor: "#FFFFFF",
    margin: 20,
    padding: 20,
    borderRadius: 24,
    elevation: 4,
  },

  errorTitle: {
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 10,
    color: "#0F172A",
  },

  errorText: {
    fontSize: 15,
    color: "#475569",
    marginBottom: 10,
  },

  errorReason: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
  },

  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 20,
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
});