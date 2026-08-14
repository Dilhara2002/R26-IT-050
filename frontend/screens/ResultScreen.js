import React from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";

export default function ResultScreen({ route, navigation }) {
  const { data } = route.params;

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

        <Pressable
          onPress={() => navigation.navigate("Map", { itineraryData: data })}
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
  page: { flex: 1, backgroundColor: "#EAF2FF" },
  content: { 
    padding: 18, 
    paddingBottom: 40,
    width: "100%",
    maxWidth: 800, // <--- Web width constraint
    alignSelf: "center",
  },
  hero: { backgroundColor: "#1D4ED8", borderRadius: 28, padding: 26, marginBottom: 18 },
  aiBadge: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.18)", color: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, fontWeight: "800", marginBottom: 16 },
  title: { fontSize: 32, fontWeight: "900", color: "#FFFFFF", marginBottom: 12 },
  subtitle: { color: "#DBEAFE", lineHeight: 23, fontSize: 15 },
  assistantCard: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 20, elevation: 6, marginBottom: 10 },
  assistantHeader: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  botCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#DBEAFE", justifyContent: "center", alignItems: "center", marginRight: 12 },
  botIcon: { fontSize: 25 },
  cardTitle: { fontSize: 20, fontWeight: "900", color: "#0F172A" },
  cardSub: { color: "#64748B", marginTop: 3 },
  sectionTitle: { fontWeight: "800", color: "#0F172A", marginBottom: 12, fontSize: 17, marginTop: 10 },
  generateButton: { backgroundColor: "#2563EB", borderRadius: 20, paddingVertical: 18, alignItems: "center", justifyContent: "center", flexDirection: "row" },
  generateText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  generateIcon: { color: "#FFFFFF", fontSize: 18, marginLeft: 8 },
  pressed: { opacity: 0.75 },
  featureGrid: { gap: 12 },
  featureCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 18, elevation: 3, flexDirection: 'row', alignItems: 'center' },
  stepCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  stepNumber: { color: '#fff', fontWeight: 'bold' },
  featureTitle: { fontSize: 17, fontWeight: "900", color: "#0F172A", marginBottom: 4 },
  featureText: { color: "#64748B", lineHeight: 20 },
  aiSummary: { color: "#475569", lineHeight: 22, fontSize: 15, textAlign: 'justify' },
});