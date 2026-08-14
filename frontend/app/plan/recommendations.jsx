import React, { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import TourismCard from "../../components/tourism/TourismCard";
import Page, { sharedStyles as s } from "../../src/components/shared/Page";
import { generateRecommendations } from "../../src/services/api/recommendations";
import { useTripDraft } from "../../src/state/TripDraftContext";

export default function Recommendations() {
  const { draft, updateDraft } = useTripDraft();
  const [loading, setLoading] = useState(!draft.recommendations);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!draft.prompt) return;
    setLoading(true); setError("");
    try {
      const data = await generateRecommendations(draft.prompt);
      updateDraft({ recommendations: data, selectedHotel: data.selectedPackage || null, selectedActivities: data.selectedPackage?.activities || [] });
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [draft.prompt, updateDraft]);
  useEffect(() => { if (draft.prompt && !draft.recommendations) load(); }, [draft.prompt, draft.recommendations, load]);
  const toggleActivity = (activity) => {
    const selected = draft.selectedActivities.some((item) => (item.activityId || item.name) === (activity.activityId || activity.name));
    updateDraft({ selectedActivities: selected ? draft.selectedActivities.filter((item) => (item.activityId || item.name) !== (activity.activityId || activity.name)) : [...draft.selectedActivities, activity] });
  };
  const pkg = draft.recommendations?.selectedPackage;
  if (!draft.prompt) return <Page title="Start with your trip details" subtitle="Recommendations need a trip request first."><Pressable style={s.button} onPress={() => router.replace("/plan")}><Text style={s.buttonText}>Go to planner</Text></Pressable></Page>;
  return (
    <Page title="Your recommendations" subtitle="Choose the activities you want before optimizing the route.">
      {loading ? <ActivityIndicator size="large" color="#2563eb" /> : null}
      {error ? <><Text style={s.error}>{error}</Text><Pressable style={s.button} onPress={load}><Text style={s.buttonText}>Try again</Text></Pressable></> : null}
      {!loading && !error && !pkg ? <View style={s.card}><Text style={s.sectionTitle}>No matching package</Text><Text style={s.muted}>{draft.recommendations?.userFriendlyResponse || "Try a broader destination or preference."}</Text><Pressable style={[s.button, { marginTop: 14 }]} onPress={() => router.replace("/plan")}><Text style={s.buttonText}>Edit trip</Text></Pressable></View> : null}
      {pkg ? <>
        <Text style={s.sectionTitle}>Hotel</Text>
        <TourismCard type="hotel" title={pkg.hotelName} subtitle={`${pkg.hotelCategory || "Hotel"} • ${pkg.district}`} description={`Grade: ${pkg.grade || "Not listed"}\nFood: ${pkg.foodType || "Not listed"}`} tags={[pkg.grade, pkg.foodType].filter(Boolean)} />
        <Text style={s.sectionTitle}>Activities</Text>
        {pkg.activities?.map((activity) => {
          const selected = draft.selectedActivities.some((item) => (item.activityId || item.name) === (activity.activityId || activity.name));
          return <Pressable key={activity.activityId || activity.name} onPress={() => toggleActivity(activity)} style={{ opacity: selected ? 1 : 0.55 }}>
            <TourismCard type="activity" title={`${selected ? "✓ " : ""}${activity.name}`} subtitle={`${activity.category || "Activity"} • ${activity.durationHours || "?"} hours`} description={activity.description} tags={[activity.priceLevel, activity.suitableFor].filter(Boolean)} />
          </Pressable>;
        })}
        <Pressable style={s.button} disabled={!draft.selectedActivities.length} onPress={() => router.push("/plan/itinerary")}><Text style={s.buttonText}>Optimize selected activities</Text></Pressable>
      </> : null}
    </Page>
  );
}
