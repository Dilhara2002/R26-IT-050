import React from "react";
import { View, Text, StyleSheet } from "react-native";
import SafetyRouteMap from "../components/SafetyRouteMap";

export default function SafetyMapScreen({ route }) {
  const selectedRoute = route.params?.selectedRoute || null;
  const coordinates = selectedRoute?.geometry?.coordinates || [];

  return (
    <View style={styles.container}>
      <SafetyRouteMap coordinates={coordinates} />
      <View style={styles.summaryCard}>
        <Text style={styles.title} numberOfLines={1}>
          {selectedRoute?.startLocation} → {selectedRoute?.endLocation}
        </Text>
        <Text style={styles.details}>
          {selectedRoute?.distanceKm ?? "—"} km  •  {selectedRoute?.durationMinutes ?? "—"} mins
        </Text>
        <View style={styles.riskBadge}>
          <Text style={styles.riskText}>
            {selectedRoute?.predictedRiskLevel || "Unknown"} route risk
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#D7CAB0" },
  summaryCard: {
    position: "absolute", top: 18, alignSelf: "center", width: "90%",
    maxWidth: 480, backgroundColor: "#FBF7EC", borderRadius: 20,
    padding: 18, elevation: 8, shadowColor: "#241F18", borderWidth: 1, borderColor: "#D7CAB0",
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8,
  },
  title: { color: "#241F18", fontSize: 17, fontWeight: "600", fontFamily: "serif" },
  details: { color: "#6F6658", fontSize: 13, marginTop: 5 },
  riskBadge: { alignSelf: "flex-start", backgroundColor: "#E7DBBA", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6, marginTop: 11 },
  riskText: { color: "#3E6650", fontSize: 12, fontWeight: "800" },
});
