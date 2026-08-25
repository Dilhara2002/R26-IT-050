import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import TripSafetyAnalysis from "../components/TripSafetyAnalysis";
import {
  buildItinerarySafetyRequest,
  getItinerarySafetyAvailability,
  recommendItinerarySafety,
} from "../services/safetyApi";

export default function ResultScreen({ route, navigation }) {
  const { data, persistence } = route.params || {};
  const [budget, setBudget] = useState("");
  const [passengers, setPassengers] = useState("");
  const [preferredCategory, setPreferredCategory] = useState("");
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyResult, setSafetyResult] = useState(null);
  const [safetyError, setSafetyError] = useState("");
  const [validationError, setValidationError] = useState("");

  const optimizedStops = Array.isArray(data?.optimized_stops) ? data.optimized_stops : [];
  const startingLocation = data?.starting_location || null;
  const availabilityMessage = getItinerarySafetyAvailability(startingLocation, optimizedStops);

  const handleSafetyAnalysis = async () => {
    if (safetyLoading) return;

    setValidationError("");
    setSafetyError("");

    if (availabilityMessage) {
      setValidationError(availabilityMessage);
      return;
    }

    const normalizedBudget = Number(budget.trim());
    const normalizedPassengers = Number(passengers.trim());
    if (!budget.trim() || !Number.isFinite(normalizedBudget) || normalizedBudget <= 0) {
      setValidationError("Enter a whole-trip budget greater than 0 LKR.");
      return;
    }
    if (
      !passengers.trim() ||
      !Number.isInteger(normalizedPassengers) ||
      normalizedPassengers <= 0
    ) {
      setValidationError("Enter a passenger count as a positive whole number.");
      return;
    }

    setSafetyLoading(true);
    setSafetyResult(null);
    try {
      const payload = buildItinerarySafetyRequest({
        startingLocation,
        optimizedStops,
        budget: normalizedBudget,
        passengers: normalizedPassengers,
        preferredCategory: preferredCategory.trim(),
      });
      const response = await recommendItinerarySafety(payload);
      if (!response || typeof response !== "object") {
        setSafetyError("The safety service returned an unusable response.");
        return;
      }
      setSafetyResult(response);
    } catch (error) {
      if (error?.safetyResponse && typeof error.safetyResponse === "object") {
        setSafetyResult(error.safetyResponse);
      }
      setSafetyError(error?.message || "Trip safety analysis could not be completed.");
    } finally {
      setSafetyLoading(false);
    }
  };

  if (!data) {
    return (
      <View style={styles.missingResult}>
        <Text style={styles.missingResultText}>The itinerary result is unavailable.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.aiBadge}>✦ Optimized Itinerary</Text>
        <Text style={styles.title}>Your Travel Plan</Text>
        <Text style={styles.subtitle}>
          A heuristic route built from the bounded, source-traced Kandy dataset.
        </Text>
      </View>

      <View style={styles.assistantCard}>
        <View style={styles.assistantHeader}>
          <View style={styles.botCircle}>
            <Text style={styles.botIcon}>⏱️</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Total Estimated Duration</Text>
            <Text style={styles.cardSub}>{data.estimated_time_required}</Text>
          </View>
        </View>

        <Text style={styles.estimateText}>
          {data.visit_time_minutes} min research-estimated visits + {data.travel_time_minutes} min estimated travel
        </Text>
        <Text style={styles.estimationNote}>
          Travel uses straight-line Haversine distance, an assumed {data.travel_estimation?.assumed_average_speed_kmh || 30} km/h speed and a traffic buffer. It excludes real-road routing, live traffic, opening hours, return travel, parking and walking.
        </Text>

        {persistence && (
          <Text style={styles.persistenceText}>
            {persistence.saved
              ? "Saved to itinerary history."
              : "Route generated successfully; itinerary history was not saved."}
          </Text>
        )}

        <Pressable
          onPress={() => navigation.navigate("Map", {
            optimizedStops,
            startingLocation,
            safetyLegs: Array.isArray(safetyResult?.per_leg_safety_results)
              ? safetyResult.per_leg_safety_results
              : [],
          })}
          style={({ pressed }) => [
            styles.generateButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.generateText}>View on Interactive Map</Text>
          <Text style={styles.generateIcon}>🗺️</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Step-by-Step Plan</Text>
      <View style={styles.featureGrid}>
        {optimizedStops.map((stop, index) => (
          <View key={stop.place_id || index} style={styles.featureCard}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{stop.name} ({stop.duration_minutes} mins)</Text>
              <Text style={styles.featureText}>{stop.explanation}</Text>
              <Text style={styles.sourceText}>
                Source: {stop.source_name} · {stop.source_license}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.assistantCard, { marginTop: 20, backgroundColor: '#FFF7ED', borderColor: '#FFEDD5', borderWidth: 1 }]}>
        <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>✦ Route Explanation</Text>
        <Text style={styles.aiSummary}>
          {data.route_explanation?.summary || data.ai_summary}
        </Text>
      </View>

      <TripSafetyAnalysis
        budget={budget}
        passengers={passengers}
        preferredCategory={preferredCategory}
        onBudgetChange={setBudget}
        onPassengersChange={setPassengers}
        onPreferredCategoryChange={setPreferredCategory}
        onAnalyze={handleSafetyAnalysis}
        loading={safetyLoading}
        availabilityMessage={availabilityMessage}
        validationError={validationError}
        requestError={safetyError}
        result={safetyResult}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#EAF2FF" },
  content: { 
    padding: 18, 
    paddingBottom: 40,
    width: "100%",
    maxWidth: 800, // <--- Web width constraint
    alignSelf: "center",
  },
  hero: { backgroundColor: "#1D4ED8", borderRadius: 28, padding: 26, marginBottom: 18 },
  aiBadge: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", color: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontWeight: "800", marginBottom: 16 },
  title: { fontSize: 32, fontWeight: "900", color: "#FFFFFF", marginBottom: 12 },
  subtitle: { color: "#DBEAFE", lineHeight: 23, fontSize: 15 },
  assistantCard: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 20, elevation: 6, marginBottom: 10 },
  assistantHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  botCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#DBEAFE", justifyContent: "center", alignItems: "center", marginRight: 12 },
  botIcon: { fontSize: 25 },
  cardTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  cardSub: { color: "#64748B", marginTop: 3 },
  estimateText: { color: "#334155", fontWeight: "700", marginBottom: 8 },
  estimationNote: { color: "#64748B", lineHeight: 19, marginBottom: 16, fontSize: 13 },
  persistenceText: { color: "#64748B", marginBottom: 16 },
  sectionTitle: { fontWeight: "800", color: "#0F172A", marginBottom: 12, fontSize: 17, marginTop: 10 },
  generateButton: { backgroundColor: "#2563EB", borderRadius: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  generateText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  generateIcon: { color: "#FFFFFF", fontSize: 18, marginLeft: 8 },
  pressed: { opacity: 0.75 },
  featureGrid: { gap: 12 },
  featureCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 18, elevation: 3, flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  stepNumber: { color: '#fff', fontWeight: 'bold' },
  featureTitle: { fontSize: 17, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  featureText: { color: "#64748B", lineHeight: 20 },
  sourceText: { color: "#1D4ED8", fontSize: 12, fontWeight: "700", marginTop: 8 },
  aiSummary: { color: "#475569", lineHeight: 22, fontSize: 15, textAlign: 'justify' },
  missingResult: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#EAF2FF" },
  missingResultText: { color: "#B91C1C", fontWeight: "800", fontSize: 16, textAlign: "center" },
});
