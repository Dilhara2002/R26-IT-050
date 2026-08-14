import React, { useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import VehicleCard from "../../src/components/VehicleCard";
import Page, { sharedStyles as s } from "../../src/components/shared/Page";
import { recommendVehicle } from "../../src/services/api/safety";
import { useTripDraft } from "../../src/state/TripDraftContext";

const categories = ["All", "Economy", "Sedan", "SUV", "Van", "MUV", "Luxury"];

export default function Safety() {
  const { draft, updateDraft } = useTripDraft();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("");
  const analyze = async () => {
    setLoading(true); setError("");
    try {
      const data = await recommendVehicle({ budget: Number(draft.budget), passengers: Number(draft.passengers), startLocation: draft.originName, endLocation: draft.destinationName, preferredCategory: category });
      updateDraft({ safety: data, selectedVehicle: data.bestVehicle || null });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  if (!draft.itinerary) return <Page title="Create an itinerary first" subtitle="Route safety needs an optimized trip route."><Pressable style={s.button} onPress={() => router.replace(draft.selectedActivities.length ? "/plan/itinerary" : "/plan")}><Text style={s.buttonText}>Continue planning</Text></Pressable></Page>;
  return (
    <Page title="Route safety and transport" subtitle="We use your trip details to assess the route and find a suitable vehicle.">
      <View style={s.card}>
        <Text style={s.label}>Route</Text><Text style={[s.muted, { marginBottom: 14 }]}>{draft.originName} → {draft.destinationName}</Text>
        <Text style={s.label}>Budget (LKR)</Text><TextInput style={s.input} keyboardType="numeric" value={draft.budget} onChangeText={(budget) => updateDraft({ budget })} />
        <Text style={s.label}>Passengers</Text><TextInput style={s.input} keyboardType="numeric" value={draft.passengers} onChangeText={(passengers) => updateDraft({ passengers })} />
        <Text style={s.label}>Preferred vehicle</Text><View style={s.rowWrap}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item === "All" ? "" : item)} style={[s.chip, (category === item || (!category && item === "All")) && s.chipSelected]}><Text style={[s.chipText, (category === item || (!category && item === "All")) && s.chipTextSelected]}>{item}</Text></Pressable>)}</View>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable style={s.button} onPress={analyze} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Analyze route and recommend vehicle</Text>}</Pressable>
      </View>
      {draft.safety ? <View style={s.card}>
        <Text style={s.sectionTitle}>Route assessment</Text>
        <Text style={[s.muted, { fontWeight: "800" }]}>Risk level: {draft.safety.riskPrediction?.riskLevel || "Unavailable"}</Text>
        <Text style={s.muted}>Confidence: {draft.safety.riskPrediction?.confidencePercent ?? "Unavailable"}{draft.safety.riskPrediction?.confidencePercent != null ? "%" : ""}</Text>
        <Text style={[s.muted, { marginTop: 8 }]}>{draft.safety.message}</Text>
        <VehicleCard vehicle={draft.safety.bestVehicle} title="Recommended vehicle" />
        {draft.safety.alternativeOptions?.map((vehicle, index) => <Pressable key={vehicle["Vehicle Name (Make & Model)"] || index} onPress={() => updateDraft({ selectedVehicle: vehicle })}><VehicleCard vehicle={vehicle} title="Alternative" /></Pressable>)}
        <Pressable style={[s.button, { marginTop: 16 }]} onPress={() => router.push("/plan/summary")}><Text style={s.buttonText}>View final trip plan</Text></Pressable>
      </View> : null}
    </Page>
  );
}
