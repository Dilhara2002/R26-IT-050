import React, { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import API from "../services/api";
import {
  applyFailedRegeneration,
  applySuccessfulRegeneration,
  buildFullRegenerationRequest,
  buildReplacementRequest,
  createRegenerationContext,
  parseGuideExplanation,
  validGuideExplanation,
  regenerationRecoveryMessage,
} from "../services/itineraryRegeneration";

const displayNumber = (value, digits = 1) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "Unavailable";

export default function ResultScreen({ route, navigation }) {
  const initialData = route.params?.data || null;
  const [data, setData] = useState(initialData);
  const [persistence, setPersistence] = useState(route.params?.persistence || null);
  const [validationError, setValidationError] = useState("");
  const [regenerationLoading, setRegenerationLoading] = useState(null);
  const [regenerationError, setRegenerationError] = useState("");
  const [regenerationErrorKind, setRegenerationErrorKind] = useState("");
  const [regenerationMessage, setRegenerationMessage] = useState("");
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const [researchExpanded, setResearchExpanded] = useState(false);
  const [regenerationContext, setRegenerationContext] = useState(() =>
    initialData ? createRegenerationContext(initialData) : null
  );

  const optimizedStops = Array.isArray(data?.optimized_stops) ? data.optimized_stops : [];
  const startingLocation = data?.starting_location || null;
  const deterministicExplanation = data?.deterministic_explanation?.summary ||
    data?.route_explanation?.summary || data?.ai_summary;
  const guideExplanation = validGuideExplanation(data, deterministicExplanation);
  const guidePresentation = useMemo(
    () => parseGuideExplanation(guideExplanation, optimizedStops),
    [guideExplanation, optimizedStops]
  );
  const busy = Boolean(regenerationLoading);

  const handleRegeneration = async (mode, stop = null) => {
    if (busy) return;
    const action = mode === "replace_stop"
      ? { mode, placeId: String(stop?.place_id || ""), name: stop?.name || "selected stop" }
      : { mode, placeId: null, name: null };
    const previousState = {
      data, persistence, validationError,
      regenerationError: "", regenerationLoading: action, regenerationContext,
    };
    setRegenerationLoading(action);
    setRegenerationError("");
    setRegenerationErrorKind("");
    setRegenerationMessage("");
    try {
      const requestPayload = mode === "replace_stop"
        ? buildReplacementRequest(data, action.placeId)
        : buildFullRegenerationRequest(data, regenerationContext);
      const response = await API.post("/optimize", requestPayload);
      const nextState = applySuccessfulRegeneration(previousState, response.data);
      setData(nextState.data);
      setPersistence(nextState.persistence);
      setValidationError("");
      setExpandedEvidence({});
      setRegenerationContext(nextState.regenerationContext);
      setRegenerationMessage(mode === "replace_stop"
        ? `${action.name} was replaced while the other accepted stops were preserved.`
        : "Another feasible plan variation was generated.");
    } catch (error) {
      const nextState = applyFailedRegeneration(previousState, error);
      setRegenerationError(nextState.regenerationError);
      setRegenerationErrorKind(nextState.regenerationErrorKind);
    } finally {
      setRegenerationLoading(null);
    }
  };

  const openSource = async (sourceUrl) => {
    try {
      await Linking.openURL(sourceUrl);
    } catch {
      setValidationError("The source link could not be opened on this device.");
    }
  };

  if (!data) {
    return (
      <View style={styles.missingResult}>
        <Text style={styles.missingTitle}>Itinerary unavailable</Text>
        <Text style={styles.missingText}>Return to the planner and generate a new itinerary.</Text>
      </View>
    );
  }

  const persistenceCopy = persistence?.saved
    ? { tone: styles.successBanner, title: "Saved", text: "This plan was saved to the prototype database." }
    : persistence
      ? { tone: styles.warningBanner, title: "Not saved", text: "The itinerary is ready, but MongoDB persistence was unavailable or skipped." }
      : { tone: styles.neutralBanner, title: "Persistence status unavailable", text: "The itinerary is ready; no database-save confirmation was returned." };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>FEASIBLE PLAN READY</Text>
        <Text style={styles.title}>Your Smart Itinerary</Text>
        <Text style={styles.subtitle}>
          {optimizedStops.length} ordered stop{optimizedStops.length === 1 ? "" : "s"} from the bounded, source-traced Central Province catalogue.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryCopy}>
            <Text style={styles.cardEyebrow}>TIME SUMMARY</Text>
            <Text style={styles.cardTitle}>{data.estimated_time_required || `${data.planned_time_minutes} minutes used`}</Text>
            <Text style={styles.cardSubtitle}>Within a {data.max_time_allocated_mins}-minute budget</Text>
          </View>
          <View style={styles.utilizationBadge}>
            <Text style={styles.utilizationValue}>{data.time_utilization_percent}%</Text>
            <Text style={styles.utilizationLabel}>utilized</Text>
          </View>
        </View>
        <View style={styles.metricGrid}>
          <Metric label="Visit time" value={`${data.visit_time_minutes} min`} />
          <Metric label="Est. travel" value={`${data.travel_time_minutes} min`} />
          <Metric label="Total used" value={`${data.planned_time_minutes} min`} />
          <Metric label="Remaining" value={`${data.remaining_time_minutes} min`} />
        </View>
        <Text style={styles.limitNote}>
          Travel uses straight-line Haversine distance, an assumed {data.travel_estimation?.assumed_average_speed_kmh || 30} km/h speed, and a traffic buffer. It excludes real-road routing, live traffic, opening hours, return travel, parking, and walking.
        </Text>
      </View>

      <View style={[styles.statusBanner, persistenceCopy.tone]}>
        <Text style={styles.statusTitle}>{persistenceCopy.title}</Text>
        <Text style={styles.statusText}>{persistenceCopy.text}</Text>
      </View>

      {validationError ? <StatusMessage kind="error" text={validationError} /> : null}

      {regenerationMessage ? <StatusMessage kind="success" text={regenerationMessage} /> : null}
      {regenerationError ? (
        <StatusMessage
          kind={regenerationErrorKind === "exhausted" ? "warning" : "error"}
          text={`${regenerationError} ${regenerationRecoveryMessage(regenerationErrorKind)}`}
        />
      ) : null}
      {regenerationLoading ? (
        <StatusMessage
          kind="loading"
          text={regenerationLoading.mode === "replace_stop"
            ? `Replacing ${regenerationLoading.name} while preserving accepted stops…`
            : "Generating another feasible plan variation…"}
        />
      ) : null}

      <View style={styles.actionCard}>
        <Text style={styles.actionHeading}>Plan actions</Text>
        <Text style={styles.actionHelper}>Choose a bounded variation or inspect the current ordered route.</Text>
        <View style={styles.actionRow}>
          <ActionButton
            label={regenerationLoading?.mode === "full_regeneration" ? "Generating variation…" : "Generate another feasible plan variation"}
            onPress={() => handleRegeneration("full_regeneration")}
            disabled={busy}
            style={styles.alternativeButton}
          />
          <ActionButton
            label="View on Interactive Map"
            onPress={() => navigation.navigate("Map", {
              optimizedStops,
              startingLocation,
            })}
            disabled={busy}
            style={styles.mapButton}
          />
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>Your ordered stops</Text>
          <Text style={styles.sectionSubtitle}>Replace one stop without discarding the other accepted places.</Text>
        </View>
        <Text style={styles.stopCount}>{optimizedStops.length} stops</Text>
      </View>

      <View style={styles.stopList}>
        {optimizedStops.map((stop, index) => {
          const evidenceOpen = Boolean(expandedEvidence[stop.place_id ?? index]);
          const evidenceKey = stop.place_id ?? index;
          return (
            <View key={evidenceKey} style={styles.stopCard}>
              <View style={styles.stopHeader}>
                <Text style={styles.sequence}>{index + 1}</Text>
                <View style={styles.stopHeadingCopy}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  <Text style={styles.stopMeta}>
                    {stop.duration_minutes} min visit{stop.district ? ` · ${stop.district}` : ""}
                  </Text>
                </View>
              </View>
              <Text style={styles.stopSummary}>
                Matches: {Array.isArray(stop.matched_preferences) && stop.matched_preferences.length
                  ? stop.matched_preferences.join(", ") : "No direct selected-interest match listed"}
              </Text>
              <View style={styles.stopActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: evidenceOpen }}
                  onPress={() => setExpandedEvidence((current) => ({ ...current, [evidenceKey]: !evidenceOpen }))}
                  style={({ pressed }) => [styles.evidenceButton, pressed && styles.pressed]}
                >
                  <Text style={styles.evidenceButtonText}>{evidenceOpen ? "Hide research details" : "Show research details"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Replace ${stop.name}`}
                  disabled={busy}
                  onPress={() => handleRegeneration("replace_stop", stop)}
                  style={({ pressed }) => [styles.replaceButton, busy && styles.disabledButton, pressed && styles.pressed]}
                >
                  <Text style={styles.replaceButtonText}>
                    {regenerationLoading?.mode === "replace_stop" && regenerationLoading.placeId === String(stop.place_id)
                      ? `Replacing ${stop.name}…` : "Replace this place"}
                  </Text>
                </Pressable>
              </View>
              {evidenceOpen ? (
                <View style={styles.evidencePanel}>
                  <EvidenceRow label="Relevance class" value={stop.predicted_relevance_class ?? "Fallback mode"} />
                  <EvidenceRow label="Classification score" value={Number.isFinite(stop.relevance_classification_score) ? `${displayNumber(stop.relevance_classification_score, 3)} · not a satisfaction probability` : "Unavailable"} />
                  <EvidenceRow label="Similarity / proximity / combined" value={`${displayNumber(stop.similarity_score, 3)} / ${displayNumber(stop.proximity_score, 3)} / ${displayNumber(stop.composite_score, 3)}`} />
                  <EvidenceRow label="Incoming estimated leg" value={`${displayNumber(stop.leg_distance_km, 2)} km · ${displayNumber(stop.estimated_leg_travel_minutes, 1)} min`} />
                  <EvidenceRow label="Duration basis" value={stop.duration_basis || "Unavailable"} />
                  <EvidenceRow label="Source status" value={stop.verification_status || "Unavailable"} />
                  <EvidenceRow label="Source" value={`${stop.source_name || "Unavailable"}${stop.source_license ? ` · ${stop.source_license}` : ""}`} />
                  <Text style={styles.deterministicStopText}>{stop.explanation}</Text>
                  {stop.source_url ? (
                    <Pressable accessibilityRole="link" onPress={() => openSource(stop.source_url)}>
                      <Text style={styles.sourceLink}>Open current visitor-information source</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.researchCard}>
        <Text style={styles.cardEyebrow}>DETERMINISTIC RESEARCH EVIDENCE</Text>
        <Text style={styles.cardTitle}>Why this route was selected</Text>
        <Text style={styles.bodyText}>{deterministicExplanation}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: researchExpanded }}
          onPress={() => setResearchExpanded((value) => !value)}
          style={({ pressed }) => [styles.inlineButton, pressed && styles.pressed]}
        >
          <Text style={styles.inlineButtonText}>{researchExpanded ? "Hide selection stages" : "Show selection stages"}</Text>
        </Pressable>
        {researchExpanded ? (
          <View style={styles.stageList}>
            {(data.route_explanation?.selection_stages || []).map((stage, index) => (
              <Text key={stage} style={styles.stageText}>{index + 1}. {String(stage).replaceAll("_", " ")}</Text>
            ))}
            <Text style={styles.stageText}>Global optimum claimed: {data.route_explanation?.is_globally_optimal ? "Yes" : "No"}</Text>
            <Text style={styles.stageText}>Catalogue: {data.catalogue_poi_count} verified/source-traced POIs across {(data.covered_districts || []).join(", ")}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.guideCard}>
        <Text style={styles.cardEyebrow}>OPTIONAL · GEMINI</Text>
        <Text style={styles.cardTitle}>Optional AI Tour Guide</Text>
        <Text style={styles.guideNote}>This guide explains the finalized itinerary in traveller-friendly language. It does not select or optimize the route.</Text>
        {guidePresentation?.structured ? guidePresentation.sections.map((section, index) => (
          <View key={`${section.type}-${section.sequence || index}`} style={section.type === "stop" ? styles.guideStop : styles.guideSection}>
            <Text style={styles.guideSectionTitle}>{section.title}</Text>
            <Text style={styles.guideBody}>{section.body}</Text>
          </View>
        )) : guidePresentation?.raw ? (
          <Text style={styles.guideBody}>{guidePresentation.raw}</Text>
        ) : (
          <View style={styles.guideUnavailable}>
            <Text style={styles.guideUnavailableTitle}>Guide unavailable</Text>
            <Text style={styles.guideUnavailableText}>The optional guide was omitted. Your itinerary, deterministic evidence, and map are unchanged.</Text>
          </View>
        )}
      </View>

    </ScrollView>
  );
}

function Metric({ label, value }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function EvidenceRow({ label, value }) {
  return <View style={styles.evidenceRow}><Text style={styles.evidenceLabel}>{label}</Text><Text style={styles.evidenceValue}>{String(value)}</Text></View>;
}

function StatusMessage({ kind, text }) {
  const tone = kind === "success" ? styles.messageSuccess : kind === "warning" ? styles.messageWarning : kind === "loading" ? styles.messageLoading : styles.messageError;
  return <View accessibilityLiveRegion={kind === "error" ? "assertive" : "polite"} style={[styles.message, tone]}><Text style={styles.messageText}>{text}</Text></View>;
}

function ActionButton({ label, onPress, disabled, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.actionButton, style, disabled && styles.disabledButton, pressed && styles.pressed]}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F1F5F9" },
  content: { width: "100%", maxWidth: 1040, alignSelf: "center", padding: 16, paddingBottom: 52 },
  hero: { backgroundColor: "#123B72", borderRadius: 24, padding: 24, marginBottom: 16 },
  eyebrow: { color: "#BFDBFE", fontSize: 12, fontWeight: "900", letterSpacing: 1.1, marginBottom: 9 },
  title: { color: "#FFFFFF", fontSize: 30, lineHeight: 37, fontWeight: "900" },
  subtitle: { color: "#DBEAFE", fontSize: 15, lineHeight: 23, marginTop: 8 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: "#DCE4EE", elevation: 2 },
  summaryHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  summaryCopy: { flexGrow: 1, flexBasis: 240, minWidth: 0 },
  cardEyebrow: { color: "#1D4ED8", fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 7 },
  cardTitle: { color: "#0F172A", fontSize: 21, lineHeight: 27, fontWeight: "900" },
  cardSubtitle: { color: "#475569", marginTop: 4 },
  utilizationBadge: { backgroundColor: "#ECFDF5", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginTop: 6, marginLeft: 8, alignItems: "center" },
  utilizationValue: { color: "#047857", fontSize: 20, fontWeight: "900" },
  utilizationLabel: { color: "#047857", fontSize: 11, fontWeight: "800" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", margin: -4 },
  metric: { flexGrow: 1, flexBasis: 150, minWidth: 0, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, margin: 4 },
  metricLabel: { color: "#64748B", fontSize: 12, fontWeight: "700" },
  metricValue: { color: "#0F172A", fontSize: 17, fontWeight: "900", marginTop: 3 },
  limitNote: { color: "#475569", fontSize: 13, lineHeight: 20, marginTop: 13 },
  statusBanner: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 14 },
  successBanner: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  warningBanner: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" },
  neutralBanner: { backgroundColor: "#F8FAFC", borderColor: "#CBD5E1" },
  statusTitle: { color: "#0F172A", fontWeight: "900" },
  statusText: { color: "#475569", lineHeight: 19, marginTop: 2 },
  message: { borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1 },
  messageSuccess: { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" },
  messageWarning: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D" },
  messageLoading: { backgroundColor: "#EFF6FF", borderColor: "#93C5FD" },
  messageError: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  messageText: { color: "#334155", lineHeight: 20, fontWeight: "700" },
  actionCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#DCE4EE" },
  actionHeading: { color: "#0F172A", fontSize: 18, fontWeight: "900" },
  actionHelper: { color: "#64748B", lineHeight: 20, marginTop: 3, marginBottom: 10 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", margin: -5 },
  actionButton: { minHeight: 50, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13, margin: 5, alignItems: "center", justifyContent: "center" },
  alternativeButton: { backgroundColor: "#0F766E", flexGrow: 1, flexBasis: 240 },
  mapButton: { backgroundColor: "#1D4ED8", flexGrow: 1, flexBasis: 240 },
  actionButtonText: { color: "#FFFFFF", fontSize: 14, lineHeight: 19, fontWeight: "900", textAlign: "center" },
  sectionHeadingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 11 },
  sectionHeadingCopy: { flexGrow: 1, flexBasis: 250, minWidth: 0 },
  sectionTitle: { color: "#0F172A", fontSize: 22, lineHeight: 28, fontWeight: "900" },
  sectionSubtitle: { color: "#64748B", lineHeight: 20, marginTop: 3 },
  stopCount: { color: "#1D4ED8", backgroundColor: "#DBEAFE", borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6, fontWeight: "900", marginTop: 6 },
  stopList: { marginBottom: 18 },
  stopCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16, marginBottom: 11, borderWidth: 1, borderColor: "#DCE4EE", elevation: 1 },
  stopHeader: { flexDirection: "row", alignItems: "center" },
  sequence: { width: 38, height: 38, borderRadius: 19, paddingTop: 8, textAlign: "center", backgroundColor: "#1D4ED8", color: "#FFFFFF", fontWeight: "900", marginRight: 12 },
  stopHeadingCopy: { flex: 1, minWidth: 0 },
  stopName: { color: "#0F172A", fontSize: 18, lineHeight: 23, fontWeight: "900", flexWrap: "wrap" },
  stopMeta: { color: "#475569", fontSize: 13, marginTop: 3 },
  stopSummary: { color: "#334155", lineHeight: 20, marginTop: 12 },
  stopActions: { flexDirection: "row", flexWrap: "wrap", margin: 7, marginHorizontal: -5 },
  evidenceButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, margin: 5, borderWidth: 1, borderColor: "#94A3B8" },
  evidenceButtonText: { color: "#334155", fontWeight: "800" },
  replaceButton: { minHeight: 44, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, margin: 5, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#93C5FD", flexShrink: 1 },
  replaceButtonText: { color: "#1D4ED8", fontWeight: "900", flexWrap: "wrap" },
  evidencePanel: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 12, marginTop: 4 },
  evidenceRow: { flexDirection: "row", flexWrap: "wrap", borderBottomWidth: 1, borderBottomColor: "#E2E8F0", paddingVertical: 7 },
  evidenceLabel: { color: "#475569", fontWeight: "800", flexBasis: 190, flexGrow: 1 },
  evidenceValue: { color: "#0F172A", flexBasis: 260, flexGrow: 2, lineHeight: 19, minWidth: 0 },
  deterministicStopText: { color: "#475569", fontSize: 13, lineHeight: 20, marginTop: 10 },
  sourceLink: { color: "#1D4ED8", fontWeight: "900", textDecorationLine: "underline", lineHeight: 20, marginTop: 10, flexWrap: "wrap" },
  researchCard: { backgroundColor: "#FFF7ED", borderColor: "#FED7AA", borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 14 },
  bodyText: { color: "#334155", fontSize: 15, lineHeight: 23, marginTop: 9 },
  inlineButton: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", marginTop: 10 },
  inlineButtonText: { color: "#1D4ED8", fontWeight: "900", textDecorationLine: "underline" },
  stageList: { backgroundColor: "rgba(255,255,255,0.62)", borderRadius: 12, padding: 12 },
  stageText: { color: "#475569", fontSize: 13, lineHeight: 20, marginBottom: 3, flexWrap: "wrap" },
  guideCard: { backgroundColor: "#F5F3FF", borderColor: "#C4B5FD", borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 14 },
  guideNote: { color: "#5B21B6", fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 12 },
  guideSection: { marginTop: 10 },
  guideStop: { backgroundColor: "#FFFFFF", borderRadius: 13, padding: 13, marginTop: 10, borderWidth: 1, borderColor: "#DDD6FE" },
  guideSectionTitle: { color: "#4C1D95", fontSize: 16, lineHeight: 21, fontWeight: "900", flexWrap: "wrap" },
  guideBody: { color: "#334155", fontSize: 15, lineHeight: 23, marginTop: 5, flexWrap: "wrap" },
  guideUnavailable: { backgroundColor: "#FFFFFF", borderRadius: 12, padding: 12 },
  guideUnavailableTitle: { color: "#475569", fontWeight: "900" },
  guideUnavailableText: { color: "#64748B", lineHeight: 20, marginTop: 3 },
  disabledButton: { opacity: 0.5 },
  pressed: { opacity: 0.76 },
  missingResult: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#F1F5F9" },
  missingTitle: { color: "#991B1B", fontWeight: "900", fontSize: 20 },
  missingText: { color: "#475569", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 7 },
});
