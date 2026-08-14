import React, { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, TextInput, View } from "react-native";
import Page, { sharedStyles as s } from "../../src/components/shared/Page";
import { useTripDraft } from "../../src/state/TripDraftContext";

export default function Planner() {
  const { draft, updateDraft, resetDraft } = useTripDraft();
  const [error, setError] = useState("");
  const set = (key, value) => updateDraft({ [key]: value });
  const continuePlanning = () => {
    if (!draft.prompt.trim()) return setError("Describe the kind of trip you want.");
    if (Number(draft.budget) <= 0 || Number(draft.passengers) <= 0) return setError("Budget and passengers must be positive numbers.");
    setError("");
    router.push("/plan/recommendations");
  };
  return (
    <Page title="Build your Sri Lanka trip" subtitle="Start with one request. You can refine every recommendation before continuing.">
      <View style={s.card}>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Text style={s.label}>What would you like?</Text>
        <TextInput style={[s.input, { minHeight: 90 }]} multiline value={draft.prompt} onChangeText={(v) => set("prompt", v)} placeholder="Example: A 3-day nature trip in Kandy with a comfortable hotel" />
        <Text style={s.label}>Starting location</Text>
        <TextInput style={s.input} value={draft.originName} onChangeText={(v) => set("originName", v)} />
        <Text style={s.label}>Destination</Text>
        <TextInput style={s.input} value={draft.destinationName} onChangeText={(v) => set("destinationName", v)} />
        <Text style={s.label}>Budget (LKR)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={draft.budget} onChangeText={(v) => set("budget", v)} />
        <Text style={s.label}>Passengers</Text>
        <TextInput style={s.input} keyboardType="numeric" value={draft.passengers} onChangeText={(v) => set("passengers", v)} />
        <Text style={s.label}>Available itinerary time (minutes)</Text>
        <TextInput style={s.input} keyboardType="numeric" value={String(draft.timeBudgetMinutes)} onChangeText={(v) => set("timeBudgetMinutes", Number(v) || 0)} />
        <Pressable style={s.button} onPress={continuePlanning}><Text style={s.buttonText}>Find hotels and activities</Text></Pressable>
        <Pressable style={[s.button, s.secondaryButton]} onPress={resetDraft}><Text style={[s.buttonText, s.secondaryButtonText]}>Clear plan</Text></Pressable>
      </View>
    </Page>
  );
}
