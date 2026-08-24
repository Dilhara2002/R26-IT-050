import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";

// Auto-resolves to ResultMap.js on Mobile, and ResultMap.web.js on Web
import ResultMap from "../components/ResultMap";

export default function MapScreen({ route, navigation }) {
  const { optimizedStops = [], startingLocation = null, safetyLegs = [] } = route.params || {};
  const hasStructuredStops = Array.isArray(optimizedStops) && optimizedStops.length > 0;
  const analyzedLegs = Array.isArray(safetyLegs) ? safetyLegs : [];
  const failedLegs = analyzedLegs.filter((leg) => leg?.status === 'failed').length;
  const incompleteLegs = analyzedLegs.filter(
    (leg) => leg?.status === 'success' && leg?.risk_evidence_available !== true
  ).length;

  return (
    <View style={styles.container}>
      <ResultMap
        startingLocation={startingLocation}
        optimizedStops={optimizedStops}
        safetyLegs={analyzedLegs}
      />

      {!hasStructuredStops && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            Structured itinerary stops are unavailable for this result.
          </Text>
        </View>
      )}

      {analyzedLegs.length > 0 && (
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Safety overlay</Text>
          <View style={styles.legendRow}><View style={[styles.legendLine, { backgroundColor: '#16A34A' }]} /><Text style={styles.legendText}>Low</Text></View>
          <View style={styles.legendRow}><View style={[styles.legendLine, { backgroundColor: '#F59E0B' }]} /><Text style={styles.legendText}>Medium</Text></View>
          <View style={styles.legendRow}><View style={[styles.legendLine, { backgroundColor: '#DC2626' }]} /><Text style={styles.legendText}>High</Text></View>
          <View style={styles.legendRow}><View style={[styles.legendLine, { backgroundColor: '#64748B' }]} /><Text style={styles.legendText}>Risk unavailable</Text></View>
          {failedLegs > 0 && <Text style={styles.legendWarning}>{failedLegs} failed leg(s): no line shown</Text>}
          {incompleteLegs > 0 && <Text style={styles.legendWarning}>{incompleteLegs} leg(s) have incomplete risk evidence</Text>}
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
  legend: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 14,
    padding: 12,
    maxWidth: 250,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    elevation: 7,
  },
  legendTitle: { color: '#0F172A', fontWeight: '900', marginBottom: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  legendLine: { width: 24, height: 5, borderRadius: 3, marginRight: 8 },
  legendText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  legendWarning: { color: '#9A3412', fontSize: 11, fontWeight: '700', marginTop: 6 },
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
