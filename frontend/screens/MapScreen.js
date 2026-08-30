import React from "react";
import { View, StyleSheet, Text } from "react-native";

// Auto-resolves to ResultMap.js on Mobile, and ResultMap.web.js on Web
import ResultMap from "../components/ResultMap";
import MobileBackButton from "../src/components/MobileBackButton";

export default function MapScreen({ route, navigation }) {
  const { startingLocation = null, optimizedStops = [] } = route.params || {};
  const hasStartingLocation =
    Number.isFinite(Number(startingLocation?.lat)) &&
    Number.isFinite(Number(startingLocation?.lon));
  const validStopCount = Array.isArray(optimizedStops)
    ? optimizedStops.filter(
        (stop) =>
          Number.isFinite(Number(stop?.latitude)) &&
          Number.isFinite(Number(stop?.longitude))
      ).length
    : 0;
  const dataWarning = !hasStartingLocation
    ? "The itinerary starting location is unavailable."
    : validStopCount === 0
      ? "No itinerary stops with valid coordinates are available to map."
      : "";

  return (
    <View style={styles.container}>
      <ResultMap startingLocation={startingLocation} optimizedStops={optimizedStops} />

      {dataWarning ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{dataWarning}</Text>
        </View>
      ) : null}
      
      <View style={styles.floatingCard}>
        <Text style={styles.cardTitle}>Estimated Itinerary Map</Text>
        <Text style={styles.cardSub}>
          Numbered markers follow the optimized itinerary order.
        </Text>
        <Text style={styles.cardNote}>
          The blue line is a straight-line planning estimate, not a drivable route or live traffic view.
        </Text>
        
        <MobileBackButton
          onPress={() => navigation.goBack()}
          accessibilityLabel="Back to itinerary list"
          style={styles.backControl}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  emptyStateText: { color: '#9A3412', textAlign: 'center', fontWeight: '700' },
  floatingCard: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  cardSub: { color: "#64748B", fontSize: 13, marginTop: 2 },
  cardNote: { color: "#475569", fontSize: 12, lineHeight: 17, marginTop: 7 },
  backControl: { marginTop: 15 },
});
