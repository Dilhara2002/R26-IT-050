import React, { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import MapPicker from "../../components/MapPicker";
import ResultMap from "../../components/ResultMap";
import Page, { sharedStyles as s } from "../../src/components/shared/Page";
import { optimizeItinerary } from "../../src/services/api/itinerary";
import { useTripDraft } from "../../src/state/TripDraftContext";

export default function Itinerary() {
  const { draft, updateDraft } = useTripDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const optimize = async () => {
    setLoading(true); setError("");
    try {
      const data = await optimizeItinerary({
        preferences: draft.selectedActivities.map((a) => a.category || a.name),
        max_time_minutes: Number(draft.timeBudgetMinutes),
        current_lat: draft.origin.latitude,
        current_lon: draft.origin.longitude,
      });
      updateDraft({ itinerary: data });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  if (!draft.selectedActivities.length) return <Page title="Choose activities first" subtitle="An itinerary needs at least one selected activity."><Pressable style={s.button} onPress={() => router.replace(draft.prompt ? "/plan/recommendations" : "/plan")}><Text style={s.buttonText}>Continue planning</Text></Pressable></Page>;
  return (
    <Page title="Optimize your itinerary" subtitle="Confirm the starting point, then create the best ordered route for your selected interests.">
      <View style={s.card}>
        <Text style={s.sectionTitle}>Starting point</Text>
        <View style={{ height: 280, overflow: "hidden", borderRadius: 14, marginBottom: 14 }}>
          <MapPicker lat={draft.origin.latitude} lon={draft.origin.longitude} onSelect={(latitude, longitude) => updateDraft({ origin: { latitude, longitude } })} />
        </View>
        <Text style={s.label}>Latitude</Text>
        <TextInput style={s.input} keyboardType="numeric" value={String(draft.origin.latitude)} onChangeText={(value) => updateDraft({ origin: { ...draft.origin, latitude: Number(value) || 0 } })} />
        <Text style={s.label}>Longitude</Text>
        <TextInput style={s.input} keyboardType="numeric" value={String(draft.origin.longitude)} onChangeText={(value) => updateDraft({ origin: { ...draft.origin, longitude: Number(value) || 0 } })} />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable style={s.button} onPress={optimize} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>{draft.itinerary ? "Optimize again" : "Create optimized itinerary"}</Text>}</Pressable>
      </View>
      {draft.itinerary ? <View style={s.card}>
        <Text style={s.sectionTitle}>Ordered stops</Text>
        {(draft.itinerary.optimized_route || []).map((stop, index) => <Text key={stop.id || stop.name || index} style={[s.muted, { marginBottom: 8 }]}>{index + 1}. {typeof stop === "string" ? stop : `${stop.name} (${stop.durationMinutes} min)`}</Text>)}
        <Text style={[s.muted, { marginTop: 8 }]}>Estimated time: {draft.itinerary.estimated_time_required}</Text>
        <View style={{ height: 300, overflow: "hidden", borderRadius: 14, marginVertical: 14 }}><ResultMap location={draft.origin} itineraryData={draft.itinerary} /></View>
        <Pressable style={s.button} onPress={() => router.push("/plan/safety")}><Text style={s.buttonText}>Check route safety</Text></Pressable>
      </View> : null}
    </Page>
  );
}
