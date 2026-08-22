import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";

// Auto-resolves to ResultMap.js on Mobile, and ResultMap.web.js on Web
import ResultMap from "../components/ResultMap";

export default function MapScreen({ route, navigation }) {
  const { optimizedStops = [], startingLocation = null } = route.params || {};
  const hasStructuredStops = Array.isArray(optimizedStops) && optimizedStops.length > 0;

  return (
    <View style={styles.container}>
      <ResultMap
        startingLocation={startingLocation}
        optimizedStops={optimizedStops}
      />

      {!hasStructuredStops && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Structured itinerary stops are unavailable for this result.
          </Text>
        </View>
      )}
      
      <View style={styles.floatingCard}>
        <Text style={styles.cardTitle}>Live Route View</Text>
        <Text style={styles.cardSub}>Optimized for your current context</Text>
        
        <Pressable 
          onPress={() => navigation.goBack()} 
          style={styles.backBtn}
        >
          <Text style={styles.backBtnText}>Back to List</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyState: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  emptyStateText: { color: '#9A3412', textAlign: 'center', fontWeight: '600' },
  floatingCard: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center', // <--- Centers it perfectly on web
    width: '90%',
    maxWidth: 400, // <--- Stops it from stretching across the screen
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#0F172A" },
  cardSub: { color: "#64748B", fontSize: 13, marginTop: 2 },
  backBtn: {
    marginTop: 15,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE'
  },
  backBtnText: { color: '#1D4ED8', fontWeight: 'bold' }
});
