import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const displayValue = (value, suffix = "") =>
  value === null || value === undefined || value === "" ? "Unavailable" : `${value}${suffix}`;

const displayRisk = (risk) =>
  typeof risk === "string" && risk.trim() ? risk : "Risk unavailable";

const displayRouteMode = (mode) => {
  if (mode === "lower-risk-recommended") return "Lower-risk route selected";
  if (mode === "default-analyzed-route") return "Default route analyzed";
  return displayValue(mode);
};

function Notice({ tone, children }) {
  return (
    <View style={[styles.notice, styles[`${tone}Notice`]]}>
      <Text style={[styles.noticeText, styles[`${tone}NoticeText`]]}>{children}</Text>
    </View>
  );
}

function VehicleResult({ recommendation }) {
  if (!recommendation || recommendation.status !== "available" || !recommendation.bestVehicle) {
    return (
      <View style={styles.resultBlock}>
        <Text style={styles.resultBlockTitle}>Whole-trip vehicle recommendation</Text>
        <Text style={styles.mutedText}>
          {recommendation?.reason || "A vehicle recommendation is unavailable for this analysis."}
        </Text>
      </View>
    );
  }

  const vehicle = recommendation.bestVehicle;
  return (
    <View style={styles.resultBlock}>
      <Text style={styles.resultBlockTitle}>Whole-trip vehicle recommendation</Text>
      <Text style={styles.vehicleName}>{displayValue(vehicle.vehicleName)}</Text>
      <Text style={styles.detailText}>Category: {displayValue(vehicle.vehicleCategory)}</Text>
      <Text style={styles.detailText}>Seats: {displayValue(vehicle.seatingCapacity)}</Text>
      <Text style={styles.detailText}>
        Estimated hire price: {displayValue(vehicle.estimatedHirePrice, " LKR")}
      </Text>
      <Text style={styles.helperText}>Calculated once for the analyzed whole trip.</Text>
    </View>
  );
}

function LegResult({ leg, index }) {
  const limitations = Array.isArray(leg?.limitations) ? leg.limitations.filter(Boolean) : [];
  const isFailed = leg?.status === "failed";
  const risk = leg?.risk_evidence_available ? leg?.risk_prediction?.riskLevel : null;

  return (
    <View style={[styles.legCard, isFailed && styles.failedLegCard]}>
      <Text style={styles.legTitle}>Leg {displayValue(leg?.leg_sequence ?? index + 1)}</Text>
      <Text style={styles.legRoute}>
        {displayValue(leg?.from?.name)} → {displayValue(leg?.to?.name)}
      </Text>
      <View style={styles.detailGrid}>
        <Text style={styles.detailText}>Status: {displayValue(leg?.status)}</Text>
        <Text style={styles.detailText}>Distance: {displayValue(leg?.distance_km, " km")}</Text>
        <Text style={styles.detailText}>
          Duration: {displayValue(leg?.duration_minutes, " min")}
        </Text>
        <Text style={styles.detailText}>Route mode: {displayRouteMode(leg?.selected_route_mode)}</Text>
        <Text style={styles.detailText}>Risk level: {displayRisk(risk)}</Text>
        <Text style={styles.detailText}>
          Risk evidence: {leg?.risk_evidence_available === true ? "Available" : "Unavailable"}
        </Text>
      </View>
      {limitations.map((limitation, limitationIndex) => (
        <Text key={`${limitation}-${limitationIndex}`} style={styles.limitationText}>
          • {limitation}
        </Text>
      ))}
      {leg?.error?.message ? <Text style={styles.errorText}>{leg.error.message}</Text> : null}
    </View>
  );
}

export default function TripSafetyAnalysis({
  budget,
  passengers,
  preferredCategory,
  onBudgetChange,
  onPassengersChange,
  onPreferredCategoryChange,
  onAnalyze,
  loading,
  availabilityMessage,
  validationError,
  requestError,
  result,
}) {
  const summary = result?.whole_trip_risk_summary;
  const legs = Array.isArray(result?.per_leg_safety_results)
    ? result.per_leg_safety_results
    : [];
  const completeSuccess = result?.success === true && !result?.partial && result?.tripRiskComplete === true;
  const completeFailure = result?.success === false;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>TRIP SAFETY ANALYSIS</Text>
      <Text style={styles.title}>Analyze every road leg</Text>
      <Text style={styles.intro}>
        Add a whole-trip vehicle budget and passenger count, then request road-risk evidence for this itinerary.
      </Text>

      <Text style={styles.label}>Whole-trip budget (LKR)</Text>
      <TextInput
        value={budget}
        onChangeText={onBudgetChange}
        editable={!loading}
        keyboardType="numeric"
        placeholder="Example: 25000"
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
      <Text style={styles.helperText}>Required. Enter a positive amount for vehicle analysis.</Text>

      <Text style={styles.label}>Passengers</Text>
      <TextInput
        value={passengers}
        onChangeText={onPassengersChange}
        editable={!loading}
        keyboardType="number-pad"
        placeholder="Example: 4"
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
      <Text style={styles.helperText}>Required. Enter a positive whole number.</Text>

      <Text style={styles.label}>Vehicle category (optional)</Text>
      <TextInput
        value={preferredCategory}
        onChangeText={onPreferredCategoryChange}
        editable={!loading}
        placeholder="Example: SUV"
        placeholderTextColor="#94A3B8"
        style={styles.input}
      />
      <Text style={styles.helperText}>Leave blank to consider all vehicle categories.</Text>

      {availabilityMessage ? <Notice tone="warning">{availabilityMessage}</Notice> : null}
      {validationError ? <Notice tone="error">{validationError}</Notice> : null}

      <Pressable
        accessibilityRole="button"
        disabled={loading || Boolean(availabilityMessage)}
        onPress={onAnalyze}
        style={({ pressed }) => [
          styles.analyzeButton,
          (loading || availabilityMessage) && styles.disabledButton,
          pressed && !loading && styles.pressedButton,
        ]}
      >
        {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.analyzeButtonText}>
          {loading ? "Analyzing Trip Safety…" : "Analyze Trip Safety"}
        </Text>
      </Pressable>

      {requestError ? <Notice tone="error">{requestError}</Notice> : null}
      {completeSuccess ? <Notice tone="success">Safety evidence is complete for every trip leg.</Notice> : null}
      {result?.partial ? (
        <Notice tone="warning">Partial analysis: one or more trip legs could not be analyzed.</Notice>
      ) : null}
      {result && result?.tripRiskComplete !== true ? (
        <Notice tone="warning">
          Trip risk evidence is incomplete. Do not treat the whole-trip risk as complete.
        </Notice>
      ) : null}
      {completeFailure ? (
        <Notice tone="error">Safety analysis failed for every trip leg. No trip risk result is available.</Notice>
      ) : null}

      {summary ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Whole-trip result</Text>
          <Text style={styles.riskValue}>{displayRisk(summary.risk_level)}</Text>
          <Text style={styles.detailText}>
            Risk evidence complete: {result?.tripRiskComplete === true ? "Yes" : "No"}
          </Text>
          <Text style={styles.detailText}>
            Successful / failed / evaluable legs: {displayValue(summary.successful_legs)} / {displayValue(summary.failed_legs)} / {displayValue(summary.evaluable_risk_legs)}
          </Text>
          <Text style={styles.helperText}>
            This level summarizes available leg evidence; it is not a real-world accident probability.
          </Text>
        </View>
      ) : null}

      {result ? <VehicleResult recommendation={result.vehicle_recommendation} /> : null}

      {legs.length > 0 ? <Text style={styles.resultsHeading}>Per-leg safety results</Text> : null}
      {legs.map((leg, index) => (
        <LegResult key={leg?.leg_sequence ?? index} leg={leg} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 20, marginTop: 20, elevation: 5 },
  eyebrow: { color: "#2563EB", fontWeight: "900", fontSize: 12, letterSpacing: 1, marginBottom: 7 },
  title: { color: "#0F172A", fontWeight: "900", fontSize: 22, marginBottom: 8 },
  intro: { color: "#64748B", lineHeight: 21, marginBottom: 18 },
  label: { color: "#0F172A", fontWeight: "800", marginTop: 12, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: "#EFF6FF", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: "#0F172A", fontSize: 16 },
  helperText: { color: "#64748B", fontSize: 12, lineHeight: 17, marginTop: 6 },
  analyzeButton: { backgroundColor: "#2563EB", borderRadius: 18, paddingVertical: 16, marginTop: 20, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  analyzeButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  disabledButton: { backgroundColor: "#94A3B8", opacity: 0.8 },
  pressedButton: { opacity: 0.75 },
  notice: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  noticeText: { fontWeight: "700", lineHeight: 19 },
  warningNotice: { backgroundColor: "#FFF7ED", borderColor: "#FED7AA" },
  warningNoticeText: { color: "#9A3412" },
  errorNotice: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  errorNoticeText: { color: "#B91C1C" },
  successNotice: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  successNoticeText: { color: "#166534" },
  summaryCard: { backgroundColor: "#EFF6FF", borderRadius: 18, padding: 16, marginTop: 16, borderWidth: 1, borderColor: "#BFDBFE" },
  summaryTitle: { color: "#1E3A8A", fontWeight: "900", fontSize: 16 },
  riskValue: { color: "#0F172A", fontWeight: "900", fontSize: 24, marginVertical: 8 },
  resultBlock: { backgroundColor: "#F8FAFC", borderRadius: 18, padding: 16, marginTop: 14, borderWidth: 1, borderColor: "#E2E8F0" },
  resultBlockTitle: { color: "#0F172A", fontWeight: "900", fontSize: 16, marginBottom: 8 },
  vehicleName: { color: "#1D4ED8", fontWeight: "900", fontSize: 19, marginBottom: 6 },
  mutedText: { color: "#64748B", lineHeight: 20 },
  detailText: { color: "#475569", lineHeight: 21 },
  resultsHeading: { color: "#0F172A", fontWeight: "900", fontSize: 18, marginTop: 20, marginBottom: 10 },
  legCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 18, padding: 15, marginBottom: 10 },
  failedLegCard: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  legTitle: { color: "#2563EB", fontWeight: "900", fontSize: 15 },
  legRoute: { color: "#0F172A", fontWeight: "800", fontSize: 16, marginTop: 5, marginBottom: 8 },
  detailGrid: { gap: 2 },
  limitationText: { color: "#9A3412", lineHeight: 19, marginTop: 5 },
  errorText: { color: "#B91C1C", fontWeight: "700", marginTop: 7 },
});
