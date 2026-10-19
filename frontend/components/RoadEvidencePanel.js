
import React, { useState } from "react";
import { Linking, Platform, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { buildEvidence, evidenceCsv, googleLegLink, roadLegs } from "../services/roadEvidence";

// Format planned times for display.
const clock = (value) => value ? `${value.slice(0, 10)} ${value.slice(11, 16)} (LK)` : "Unavailable";

export default function RoadEvidencePanel({ data, onApplyWindows, busy }) {

  // Store trip observations and form state.
  const [observations, setObservations] = useState({});
  const [trip, setTrip] = useState({});
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  const [windows, setWindows] = useState(() => Object.fromEntries(data.optimized_stops.map((stop) => {
    const value = data.planning_options.visit_windows?.[String(stop.place_id)];
    return [String(stop.place_id), value ? { opens: value.opens_at.slice(11, 16), closes: value.closes_at.slice(11, 16), source: value.source_url } : {}];
  })));

  // Prepare the journey legs and update user inputs.
  const legs = roadLegs(data);
  const update = (index, field, value) => setObservations((old) => ({ ...old, [index]: { ...old[index], [field]: value } }));
  const updateWindow = (id, field, value) => setWindows((old) => ({ ...old, [id]: { ...old[id], [field]: value } }));

  // Export recorded trip evidence as JSON or CSV.
  const save = async (format) => {
    try {
      const packet = buildEvidence(data, observations, trip);
      const content = format === "csv" ? evidenceCsv(packet) : JSON.stringify(packet, null, 2);

      if (Platform.OS === "web") {
        const url = URL.createObjectURL(new Blob([content], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `itinerary-evidence-${data.planning_options.departure_time.slice(0, 10)}.${format}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: "Itinerary field evidence", message: content });
      }

      setMessage(packet.metrics.observed_leg_count
        ? `${packet.metrics.observed_leg_count}/${packet.metrics.total_leg_count} legs recorded. Model MAE: ${packet.metrics.model_mae_minutes.toFixed(1)} min. Exported observations are user supplied.`
        : "Exported a blank evidence template. No real-trip accuracy result is claimed.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  // Check and apply user-supplied venue opening hours.
  const applyWindows = async () => {
    try {
      const visitWindows = {};
      const date = data.planning_options.departure_time.slice(0, 10);

      for (const [id, entry] of Object.entries(windows)) {
        if (!entry.opens && !entry.closes && !entry.source) continue;

        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.opens || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.closes || "") || !/^https?:\/\//.test(entry.source || "")) {
          throw new Error("Each supplied window needs opening and closing times (HH:MM) plus a source URL. Leave all three blank if unknown.");
        }

        visitWindows[id] = {
          opens_at: `${date}T${entry.opens}:00+05:30`,
          closes_at: `${date}T${entry.closes}:00+05:30`,
          source_url: entry.source
        };
      }

      await onApplyWindows(visitWindows);
    } catch (error) {
      setMessage(error.message);
    }
  };

  // Display the schedule and optional validation tools.
  return <View style={styles.card}>
    <Text style={styles.title}>Day schedule & field validation</Text>

    <Text style={styles.text}>Finish: {clock(data.scheduled_finish_time)}. Break: {data.break_time_minutes} min at the first stop before visiting. Waiting: {data.waiting_time_minutes} min. Return drive: {data.return_travel_minutes} min.</Text>

    <Text style={styles.text}>This is an estimated feasible plan. Unknown opening hours and real-world conditions still need checking.</Text>
    <Text style={styles.text}>{data.travel_estimation.attribution}</Text>

    <View style={styles.row}>
      <Button label="Map data & licence" onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright").catch(() => setMessage("Could not open attribution."))} />
      <Button label="Fix the map" onPress={() => Linking.openURL("https://www.openstreetmap.org").catch(() => setMessage("Could not open map."))} />
    </View>

    <Button label={expanded ? "Hide validation tools" : "Check opening hours / record trip evidence"} onPress={() => setExpanded(!expanded)} />

    {expanded ? <>
      {/* Collect and verify manually entered opening hours. */}
      <Text style={styles.heading}>Opening hours for this trip date</Text>

      <Text style={styles.text}>Use an official source or venue confirmation. These entries are user supplied, not independently verified. Rechecking preserves the selected places; an infeasible schedule is rejected. Export observations before rechecking or regenerating.</Text>

      {data.optimized_stops.map((stop) => <View key={stop.place_id} style={styles.section}>
        <Text style={styles.heading}>{stop.sequence}. {stop.name}</Text>
        <Text style={styles.text}>Visit {clock(stop.visit_start_time)} → {clock(stop.departure_time)}</Text>
        <Input label={`Opening time for ${stop.name}`} placeholder="Opens HH:MM" value={windows[stop.place_id]?.opens} onChangeText={(v) => updateWindow(stop.place_id, "opens", v)} />
        <Input label={`Closing time for ${stop.name}`} placeholder="Closes HH:MM" value={windows[stop.place_id]?.closes} onChangeText={(v) => updateWindow(stop.place_id, "closes", v)} />
        <Input label={`Opening hours source for ${stop.name}`} placeholder="Source URL" value={windows[stop.place_id]?.source} onChangeText={(v) => updateWindow(stop.place_id, "source", v)} />
      </View>)}

      <Button label={busy ? "Checking…" : "Recheck this plan with supplied hours"} disabled={busy} onPress={applyWindows} />

      {/* Open Google Maps and record travel-time comparisons. */}
      <Text style={styles.heading}>Google Maps comparison & actual trip</Text>

      <Text style={styles.text}>Open each leg for a free manual comparison. Set the same departure date/time and driving mode in Maps; the link does not set departure time. Record driving only, excluding visits/breaks. Note actual departure, traffic/weather, Google observation time and screenshot/log reference. Save JSON for the complete report; CSV contains leg observations only. Inputs stay only on this screen until exported.</Text>

      {legs.map((leg, index) => <View key={leg.sequence} style={styles.section}>
        <Text style={styles.heading}>{leg.sequence}. {leg.from.name} → {leg.to.name}</Text>
        <Text style={styles.text}>Plan: {leg.predicted.toFixed(1)} min · departure {clock(leg.departure)}</Text>

        <Button label="Compare this leg in Google Maps" onPress={() => Linking.openURL(googleLegLink(leg)).catch(() => setMessage("Could not open Google Maps."))} />

        <Input label={`Leg ${leg.sequence} Google minutes`} placeholder="Google estimate (minutes)" value={observations[index]?.google} onChangeText={(v) => update(index, "google", v)} numeric />
        <Input label={`Leg ${leg.sequence} actual minutes`} placeholder="Actual driving time (minutes)" value={observations[index]?.actual} onChangeText={(v) => update(index, "actual", v)} numeric />
        <Input label={`Leg ${leg.sequence} evidence notes`} placeholder="Departure, conditions, Maps observation time, evidence reference" value={observations[index]?.note} onChangeText={(v) => update(index, "note", v)} />
      </View>)}

      {/* Record trip completion and export observations. */}
      <Input label="Actual full trip duration" placeholder="Actual full trip duration including visits/breaks (minutes)" value={trip.actualTotal} onChangeText={(v) => setTrip({ ...trip, actualTotal: v })} numeric />

      <Text style={styles.text}>All planned places visited? {trip.completed === true ? "Yes" : trip.completed === false ? "No" : "Not recorded"}</Text>

      <View style={styles.row}>
        <Button label="Yes" onPress={() => setTrip({ ...trip, completed: true })} />
        <Button label="No" onPress={() => setTrip({ ...trip, completed: false })} />
        <Button label="Not recorded" onPress={() => setTrip({ ...trip, completed: undefined })} />
      </View>

      <Input label="Trip deviations" placeholder="Closed venues, missed stops, actual visit/break times, delays and other deviations" value={trip.notes} onChangeText={(v) => setTrip({ ...trip, notes: v })} />

      <View style={styles.row}>
        <Button label="Export full evidence JSON" onPress={() => save("json")} />
        <Button label="Export leg CSV" onPress={() => save("csv")} />
      </View>
    </> : null}

    {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
  </View>;
}

// Shared input and button components.
function Input({ label, numeric, ...props }) {
  return <TextInput {...props} value={props.value || ""} accessibilityLabel={label} keyboardType={numeric ? "decimal-pad" : "default"} style={styles.input} />;
}

function Button({ label, ...props }) {
  return <Pressable {...props} accessibilityRole="button" style={[styles.button, props.disabled && { opacity: 0.5 }]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

// Basic panel styles.
const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: "#CBD5E1" },
  title: { fontSize: 20, fontWeight: "800", color: "#183D3D" }, heading: { fontSize: 15, fontWeight: "700", marginTop: 12, color: "#183D3D" },
  text: { fontSize: 13, lineHeight: 20, color: "#475569", marginVertical: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { padding: 12, backgroundColor: "#E8F3F0", borderRadius: 10, marginVertical: 4 },
  buttonText: { color: "#17594A", fontWeight: "700" }, section: { borderTopWidth: 1, borderColor: "#E2E8F0", marginTop: 12, paddingTop: 8 },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, padding: 12, marginVertical: 5, color: "#0F172A" },
  message: { color: "#854D0E", marginTop: 10, lineHeight: 20 },
});
