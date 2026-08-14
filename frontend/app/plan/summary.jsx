import React from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import ResultMap from "../../components/ResultMap";
import VehicleCard from "../../src/components/VehicleCard";
import Page, { sharedStyles as s } from "../../src/components/shared/Page";
import { useTripDraft } from "../../src/state/TripDraftContext";

export default function Summary() {
  const { draft, resetDraft } = useTripDraft();
  if (!draft.safety) return <Page title="Your plan is not complete" subtitle="Finish the itinerary and safety steps before viewing the summary."><Pressable style={s.button} onPress={() => router.replace("/plan")}><Text style={s.buttonText}>Return to planner</Text></Pressable></Page>;
  return (
    <Page title="Your complete trip plan" subtitle={`${draft.originName} to ${draft.destinationName}`}>
      <View style={s.card}><Text style={s.sectionTitle}>Hotel</Text><Text style={s.muted}>{draft.selectedHotel?.hotelName || "No hotel selected"}</Text></View>
      <View style={s.card}><Text style={s.sectionTitle}>Activities</Text>{draft.selectedActivities.map((a) => <Text key={a.activityId || a.name} style={s.muted}>• {a.name}</Text>)}</View>
      <View style={s.card}><Text style={s.sectionTitle}>Itinerary</Text>{draft.itinerary?.optimized_route?.map((stop, index) => <Text key={stop.id || stop.name || index} style={s.muted}>{index + 1}. {typeof stop === "string" ? stop : stop.name}</Text>)}<View style={{ height: 300, overflow: "hidden", borderRadius: 14, marginTop: 14 }}><ResultMap location={draft.origin} itineraryData={draft.itinerary} /></View></View>
      <View style={s.card}><Text style={s.sectionTitle}>Safety</Text><Text style={s.muted}>Route risk: {draft.safety.riskPrediction?.riskLevel}</Text><Text style={s.muted}>{draft.safety.graphRAG?.explanation || draft.safety.message}</Text><VehicleCard vehicle={draft.selectedVehicle || draft.safety.bestVehicle} title="Your vehicle" /></View>
      <Pressable style={s.button} onPress={() => { resetDraft(); router.replace("/plan"); }}><Text style={s.buttonText}>Plan another trip</Text></Pressable>
    </Page>
  );
}
