import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import VehicleCard from "../src/components/VehicleCard";
import { getItinerarySafetyRecommendation } from "../src/api/safetyApi";
import { colors } from "../src/styles/colors";
import { buildItineraryVehiclePayload } from "../services/itineraryVehicle";

const CATEGORIES = ["", "Economy", "Sedan", "SUV", "Van", "MUV", "Luxury"];

export default function ItineraryVehicleScreen({ route }) {
  const itinerary = route.params?.itinerary || null;
  const [form, setForm] = useState({ budget: "", passengers: "", preferredCategory: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const analyze = async () => {
    if (loading) return;
    setError("");
    setResult(null);
    setSelectedVehicle(null);
    let payload;
    try {
      payload = buildItineraryVehiclePayload(itinerary, form);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    setLoading(true);
    const response = await getItinerarySafetyRecommendation(payload);
    setLoading(false);
    if (!response?.success) {
      setError(response?.message || "No route-aware vehicle recommendation could be generated.");
      return;
    }
    setResult(response);
  };

  const vehicle = result?.vehicle_recommendation || null;
  const bestVehicle = vehicle?.bestVehicle || null;
  const alternatives = Array.isArray(vehicle?.alternativeOptions) ? vehicle.alternativeOptions : [];
  const risk = result?.whole_trip_risk_summary || null;
  const legs = Array.isArray(result?.per_leg_safety_results) ? result.per_leg_safety_results : [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>SMART ITINERARY + ROUTE SAFETY</Text>
        <Text style={styles.title}>Match a vehicle to your whole plan</Text>
        <Text style={styles.subtitle}>
          The ordered itinerary is analyzed leg by leg. One vehicle recommendation is then calculated for the complete trip.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vehicle preferences</Text>
        <Text style={styles.helper}>Budget and passenger count are required. Category is optional.</Text>
        <Text style={styles.label}>Total budget (LKR)</Text>
        <TextInput
          value={form.budget}
          onChangeText={(budget) => setForm((current) => ({ ...current, budget }))}
          keyboardType="numeric"
          placeholder="50000"
          placeholderTextColor="#8B8172"
          style={styles.input}
        />
        <Text style={styles.label}>Passengers</Text>
        <TextInput
          value={form.passengers}
          onChangeText={(passengers) => setForm((current) => ({ ...current, passengers }))}
          keyboardType="number-pad"
          placeholder="4"
          placeholderTextColor="#8B8172"
          style={styles.input}
        />
        <Text style={styles.label}>Preferred category (optional)</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((category) => {
            const active = form.preferredCategory === category;
            return (
              <Pressable
                key={category || "any"}
                onPress={() => setForm((current) => ({ ...current, preferredCategory: category }))}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{category || "Any"}</Text>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading} onPress={analyze} style={[styles.primaryButton, loading && styles.disabled]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Analyze Route & Find Vehicle</Text>}
        </Pressable>
      </View>

      {result ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Whole-trip safety summary</Text>
            <View style={styles.metrics}>
              <Metric label="Risk level" value={risk?.risk_level || "Unknown"} />
              <Metric label="Successful legs" value={`${risk?.successful_legs ?? 0}/${risk?.total_legs ?? legs.length}`} />
              <Metric label="Complete analysis" value={risk?.complete ? "Yes" : "Partial"} />
            </View>
            {legs.map((leg) => (
              <View key={leg.leg_sequence} style={styles.legRow}>
                <Text style={styles.legTitle}>{leg.leg_sequence}. {leg.from?.name} → {leg.to?.name}</Text>
                <Text style={styles.legMeta}>
                  {leg.status === "success"
                    ? `${leg.distance_km ?? "—"} km · ${leg.risk_prediction?.riskLevel || "Risk unavailable"}`
                    : "Safety analysis unavailable for this leg"}
                </Text>
              </View>
            ))}
          </View>

          {bestVehicle ? (
            <VehicleCard vehicle={bestVehicle} title="Best whole-trip match" onSelect={setSelectedVehicle} />
          ) : (
            <View style={styles.warning}><Text style={styles.warningText}>{vehicle?.reason || "No vehicle matched the budget, passengers and route conditions."}</Text></View>
          )}
          {alternatives.map((option, index) => (
            <VehicleCard key={`${option.vehicleName || option.model || index}`} vehicle={option} title={`Alternative ${index + 1}`} onSelect={setSelectedVehicle} />
          ))}
          {selectedVehicle ? (
            <View style={styles.selectedBanner}>
              <Text style={styles.selectedTitle}>Vehicle selected for this itinerary</Text>
              <Text style={styles.selectedText}>{selectedVehicle["Vehicle Name (Make & Model)"] || selectedVehicle.vehicleName || selectedVehicle.model}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Metric({ label, value }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{String(value)}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: 20, paddingBottom: 60 },
  hero: { backgroundColor: colors.primaryDark, borderRadius: 24, padding: 24, marginBottom: 16 },
  eyebrow: { color: colors.turmeric, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: "#FFFFFF", fontSize: 29, fontWeight: "700", fontFamily: "serif", marginTop: 7 },
  subtitle: { color: "#E7DBBA", fontSize: 14, lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 19, marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "700", fontFamily: "serif" },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  label: { color: colors.cinnamon, fontSize: 12, fontWeight: "800", marginTop: 11, marginBottom: 6 },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: colors.text, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "700" },
  chipTextActive: { color: "#FFFFFF" },
  error: { color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 11, marginTop: 13 },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginTop: 17 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  disabled: { opacity: 0.6 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14, marginBottom: 8 },
  metric: { flexGrow: 1, flexBasis: 150, backgroundColor: colors.background, borderRadius: 12, padding: 12 },
  metricLabel: { color: colors.cinnamon, fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  metricValue: { color: colors.text, fontWeight: "900", marginTop: 4 },
  legRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 11 },
  legTitle: { color: colors.text, fontWeight: "800" },
  legMeta: { color: colors.muted, fontSize: 12, marginTop: 4 },
  warning: { backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FCD34D", borderRadius: 14, padding: 15, marginTop: 4 },
  warningText: { color: "#92400E", lineHeight: 20 },
  selectedBanner: { backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#86EFAC", borderRadius: 16, padding: 16, marginTop: 15 },
  selectedTitle: { color: "#166534", fontWeight: "900" },
  selectedText: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 5 },
});
