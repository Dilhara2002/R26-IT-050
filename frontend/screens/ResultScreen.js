import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from "react-native";
import API from "../services/api";
import {
  applyFailedRegeneration,
  applySuccessfulRegeneration,
  buildFullRegenerationRequest,
  buildReplacementRequest,
  createRegenerationContext,
} from "../services/itineraryRegeneration";
import {
  buildItinerarySafetyRequest,
  getItinerarySafetyAvailability,
} from "../services/safetyApi";

export default function ResultScreen({ route, navigation }) {
  const initialData = route.params?.data || null;
  const initialPersistence = route.params?.persistence || null;
  const [data, setData] = useState(initialData);
  const [persistence, setPersistence] = useState(initialPersistence);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyResult, setSafetyResult] = useState(null);
  const [safetyError, setSafetyError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [regenerationLoading, setRegenerationLoading] = useState(null);
  const [regenerationError, setRegenerationError] = useState("");
  const [regenerationMessage, setRegenerationMessage] = useState("");
  const [regenerationContext, setRegenerationContext] = useState(() =>
    initialData ? createRegenerationContext(initialData) : null
  );

  const optimizedStops = Array.isArray(data?.optimized_stops) ? data.optimized_stops : [];
  const startingLocation = data?.starting_location || null;
  const availabilityMessage = getItinerarySafetyAvailability(startingLocation, optimizedStops);
  const deterministicExplanation = data?.deterministic_explanation?.summary ||
    data?.route_explanation?.summary || data?.ai_summary;
  const guideExplanation = data?.guide_explanation ||
    (data?.ai_paraphrase && data.ai_paraphrase !== deterministicExplanation
      ? data.ai_paraphrase
      : null);

  useEffect(() => navigation.addListener("focus", () => setSafetyLoading(false)), [navigation]);

  const handleSafetyAnalysis = () => {
    if (safetyLoading || regenerationLoading) return;

    setValidationError("");
    setSafetyError("");

    if (availabilityMessage) {
      setValidationError(availabilityMessage);
      return;
    }

    setSafetyLoading(true);
    try {
      const payload = buildItinerarySafetyRequest({
        startingLocation,
        optimizedStops,
      });
      navigation.navigate("Safety", { itinerarySafetyRequest: payload });
    } catch (error) {
      setValidationError(error?.message || "The Safety request could not be prepared.");
      setSafetyLoading(false);
    }
  };

  const handleRegeneration = async (mode, stop = null) => {
    if (regenerationLoading || safetyLoading) return;

    const action = mode === "replace_stop"
      ? { mode, placeId: String(stop?.place_id || ""), name: stop?.name || "selected stop" }
      : { mode, placeId: null, name: null };
    const previousState = {
      data,
      persistence,
      safetyResult,
      safetyError,
      validationError,
      regenerationError: "",
      regenerationLoading: action,
      regenerationContext,
    };

    setRegenerationLoading(action);
    setRegenerationError("");
    setRegenerationMessage("");
    try {
      const requestPayload = mode === "replace_stop"
        ? buildReplacementRequest(data, action.placeId)
        : buildFullRegenerationRequest(data, regenerationContext);
      const response = await API.post("/optimize", requestPayload);
      const nextState = applySuccessfulRegeneration(previousState, response.data);
      setData(nextState.data);
      setPersistence(nextState.persistence);
      setSafetyResult(null);
      setSafetyError("");
      setValidationError("");
      setRegenerationContext(nextState.regenerationContext);
      setRegenerationMessage(
        mode === "replace_stop"
          ? `${action.name} was replaced while the other accepted stops were preserved.`
          : "A different complete itinerary was generated."
      );
    } catch (error) {
      const nextState = applyFailedRegeneration(previousState, error);
      setRegenerationError(nextState.regenerationError);
    } finally {
      setRegenerationLoading(null);
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
          A heuristic route built from the bounded, source-traced Central Province dataset.
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
        <View style={styles.timeGrid}>
          <Text style={styles.timeItem}>Time budget: {data.max_time_allocated_mins} min</Text>
          <Text style={styles.timeItem}>Estimated visit time: {data.visit_time_minutes} min</Text>
          <Text style={styles.timeItem}>Estimated travel time: {data.travel_time_minutes} min</Text>
          <Text style={styles.timeItem}>Total used: {data.planned_time_minutes} min</Text>
          <Text style={styles.timeItem}>Remaining: {data.remaining_time_minutes} min</Text>
          <Text style={styles.timeItem}>Utilization: {data.time_utilization_percent}%</Text>
        </View>
        <Text style={styles.estimationNote}>
          Travel uses straight-line Haversine distance, an assumed {data.travel_estimation?.assumed_average_speed_kmh || 30} km/h speed and a traffic buffer. It excludes real-road routing, live traffic, opening hours, return travel, parking and walking.
        </Text>

        {persistence && (
          <Text style={styles.persistenceText}>
            {persistence.saved
              ? "Plan saved to prototype database."
              : "Route generated successfully; the plan was not saved to the prototype database."}
          </Text>
        )}

        {regenerationMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.successText}>
            {regenerationMessage}
          </Text>
        ) : null}
        {regenerationError ? (
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            {regenerationError} The current itinerary has been kept.
          </Text>
        ) : null}
        {regenerationLoading?.mode === "replace_stop" ? (
          <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
            Replacing {regenerationLoading.name} while preserving accepted stops…
          </Text>
        ) : null}
        {regenerationLoading?.mode === "full_regeneration" ? (
          <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
            Generating a different full itinerary…
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate a different full plan"
          disabled={Boolean(regenerationLoading) || safetyLoading}
          onPress={() => handleRegeneration("full_regeneration")}
          style={({ pressed }) => [
            styles.regenerateButton,
            (regenerationLoading || safetyLoading) && styles.disabledButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.regenerateText}>
            {regenerationLoading?.mode === "full_regeneration"
              ? "Generating a different plan…"
              : "Generate a different full plan"}
          </Text>
        </Pressable>

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
              {stop.source_url ? (
                <Pressable accessibilityRole="link" onPress={() => Linking.openURL(stop.source_url)}>
                  <Text style={styles.sourceLink}>Open POI source</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Replace ${stop.name}`}
                disabled={Boolean(regenerationLoading) || safetyLoading}
                onPress={() => handleRegeneration("replace_stop", stop)}
                style={({ pressed }) => [
                  styles.replaceButton,
                  (regenerationLoading || safetyLoading) && styles.disabledButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.replaceText}>
                  {regenerationLoading?.mode === "replace_stop" &&
                  regenerationLoading.placeId === String(stop.place_id)
                    ? `Replacing ${stop.name}…`
                    : "Replace this place"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.assistantCard, { marginTop: 20, backgroundColor: '#FFF7ED', borderColor: '#FFEDD5', borderWidth: 1 }]}>
        <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>Why this route was selected</Text>
        <Text style={styles.aiSummary}>
          {deterministicExplanation}
        </Text>
      </View>

      {guideExplanation ? (
        <View style={styles.assistantCard}>
          <Text style={styles.sectionTitle}>Optional travel-guide explanation</Text>
          <Text style={styles.aiSummary}>{guideExplanation}</Text>
        </View>
      ) : null}

      {availabilityMessage || validationError ? (
        <Text style={styles.errorText}>{validationError || availabilityMessage}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={safetyLoading || Boolean(regenerationLoading) || Boolean(availabilityMessage)}
        onPress={handleSafetyAnalysis}
        style={({ pressed }) => [
          styles.safetyButton,
          (safetyLoading || regenerationLoading || availabilityMessage) && styles.disabledButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.generateText}>
          {safetyLoading ? "Opening Safety Analysis…" : "Continue to Safety Analysis"}
        </Text>
      </Pressable>
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
  timeGrid: { backgroundColor: "#F8FAFC", borderRadius: 14, padding: 12, marginBottom: 12, gap: 4 },
  timeItem: { color: "#334155", fontSize: 13, fontWeight: "700" },
  persistenceText: { color: "#64748B", marginBottom: 16 },
  successText: { color: "#166534", fontWeight: "700", marginBottom: 12 },
  errorText: { color: "#B91C1C", fontWeight: "700", marginBottom: 12 },
  loadingText: { color: "#1D4ED8", fontWeight: "700", marginBottom: 12 },
  sectionTitle: { fontWeight: "800", color: "#0F172A", marginBottom: 12, fontSize: 17, marginTop: 10 },
  generateButton: { backgroundColor: "#2563EB", borderRadius: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  generateText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  generateIcon: { color: "#FFFFFF", fontSize: 18, marginLeft: 8 },
  regenerateButton: { backgroundColor: "#0F766E", borderRadius: 18, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  regenerateText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  replaceButton: { alignSelf: "flex-start", borderColor: "#2563EB", borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12 },
  replaceText: { color: "#1D4ED8", fontWeight: "800" },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  featureGrid: { gap: 12 },
  featureCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 18, elevation: 3, flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  stepNumber: { color: '#fff', fontWeight: 'bold' },
  featureTitle: { fontSize: 17, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  featureText: { color: "#64748B", lineHeight: 20 },
  sourceText: { color: "#1D4ED8", fontSize: 12, fontWeight: "700", marginTop: 8 },
  sourceLink: { color: "#1D4ED8", fontSize: 12, textDecorationLine: "underline", marginTop: 5 },
  aiSummary: { color: "#475569", lineHeight: 22, fontSize: 15, textAlign: 'justify' },
  safetyButton: { backgroundColor: "#7C3AED", borderRadius: 20, paddingVertical: 18, alignItems: "center", marginTop: 10 },
  missingResult: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#EAF2FF" },
  missingResultText: { color: "#B91C1C", fontWeight: "800", fontSize: 16, textAlign: "center" },
});
