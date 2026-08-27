import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";

export default function ResultScreen({ route, navigation }) {
  const { data, persistence } = route.params;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.aiBadge}>✦ Optimized Itinerary</Text>
        <Text style={styles.title}>Your Travel Plan</Text>
        <Text style={styles.subtitle}>
          We found the most time-efficient route for your interests. Here is your personalized plan.
        </Text>
      </View>

      <View style={styles.assistantCard}>
        <View style={styles.assistantHeader}>
          <View style={styles.botCircle}>
            <Text style={styles.botIcon}>⏱️</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>Total Duration</Text>
            <Text style={styles.cardSub}>{data.estimated_time_required}</Text>
          </View>
        </View>

        {persistence && (
          <Text style={styles.persistenceText}>
            {persistence.saved
              ? "Saved to itinerary history."
              : "Route generated successfully; itinerary history was not saved."}
          </Text>
        )}

        <Pressable
          onPress={() => navigation.navigate("Map", {
            optimizedStops: data.optimized_stops,
            startingLocation: data.starting_location,
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
        {data.optimized_route.map((place, index) => (
          <View key={index} style={styles.featureCard}>
            <View style={styles.stepCircle}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{place}</Text>
              <Text style={styles.featureText}>Confirmed Destination</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.assistantCard, { marginTop: 20, backgroundColor: '#FFF7ED', borderColor: '#FFEDD5', borderWidth: 1 }]}>
        <Text style={[styles.sectionTitle, { color: '#C2410C' }]}>✦ Route Explanation</Text>
        <Text style={styles.aiSummary}>{data.ai_summary}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F1E9D2" },
  content: { 
    padding: 18, 
    paddingBottom: 40,
    width: "100%",
    maxWidth: 800, // <--- Web width constraint
    alignSelf: "center",
  },
  hero: { backgroundColor: "#1C2A44", borderRadius: 28, padding: 26, marginBottom: 18 },
  aiBadge: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", color: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontWeight: "800", marginBottom: 16 },
  title: { fontSize: 32, fontWeight: "600", fontFamily: "serif", color: "#FFFFFF", marginBottom: 12 },
  subtitle: { color: "#E7DBBA", lineHeight: 23, fontSize: 15 },
  assistantCard: { backgroundColor: "#FBF7EC", borderRadius: 28, padding: 20, elevation: 6, marginBottom: 10, borderWidth: 1, borderColor: "#D7CAB0", shadowColor: "#241F18", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  assistantHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  botCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#E7DBBA", justifyContent: "center", alignItems: "center", marginRight: 12 },
  botIcon: { fontSize: 25 },
  cardTitle: { fontSize: 20, fontWeight: "600", fontFamily: "serif", color: "#241F18" },
  cardSub: { color: "#6F6658", marginTop: 3 },
  persistenceText: { color: "#6F6658", marginBottom: 16 },
  sectionTitle: { fontWeight: "600", fontFamily: "serif", color: "#241F18", marginBottom: 12, fontSize: 17, marginTop: 10 },
  generateButton: { backgroundColor: "#3E6650", borderRadius: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  generateText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  generateIcon: { color: "#FFFFFF", fontSize: 18, marginLeft: 8 },
  pressed: { opacity: 0.75 },
  featureGrid: { gap: 12 },
  featureCard: { backgroundColor: "#FBF7EC", borderRadius: 22, padding: 18, elevation: 3, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: "#D7CAB0" },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3E6650', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  stepNumber: { color: '#fff', fontWeight: 'bold' },
  featureTitle: { fontSize: 17, fontWeight: "600", fontFamily: "serif", color: "#241F18", marginBottom: 4 },
  featureText: { color: "#6F6658", lineHeight: 20 },
  aiSummary: { color: "#6F6658", lineHeight: 22, fontSize: 15, textAlign: 'justify' },
});
