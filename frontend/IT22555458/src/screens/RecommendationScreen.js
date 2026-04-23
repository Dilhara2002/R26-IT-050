import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
// අපේ Logic Engine එක මෙතනට Import කරනවා
import { calculateSafetyScore } from '../services/safetyLogic';

const RecommendationScreen = ({ route, navigation }) => {
  // Navigation හරහා එන දත්ත
  const { passengers, selectedVehicle, destination } = route.params;
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    // සැබෑ ගණනය කිරීම සිදු කිරීම
    const result = calculateSafetyScore(
      selectedVehicle.engine_cc,
      passengers,
      destination.max_gradient
    );
    setAnalysis(result);
  }, [selectedVehicle, passengers, destination]);

  if (!analysis) return null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Safety Analysis</Text>
        <Text style={styles.subtitle}>Terrain-Aware Intelligence System</Text>
      </View>

      {/* Safety Gauge / Score Card */}
      <View style={[styles.resultCard, { borderColor: analysis.color }]}>
        <View style={styles.scoreHeader}>
          <Text style={[styles.statusText, { color: analysis.color }]}>
            {analysis.status}
          </Text>
          <View style={[styles.badge, { backgroundColor: analysis.color }]}>
            <Text style={styles.badgeText}>{analysis.safetyPercentage}% Score</Text>
          </View>
        </View>

        <Text style={styles.justificationText}>{analysis.reason}</Text>
        
        <View style={styles.divider} />
        
        {/* Technical Breakdown Section (Research Importance) */}
        <View style={styles.techDetails}>
          <Text style={styles.techTitle}>Technical Justification:</Text>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Max Road Gradient:</Text>
            <Text style={styles.value}>{destination.max_gradient}%</Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Vehicle Safe Limit:</Text>
            <Text style={styles.value}>{analysis.maxSlope}%</Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.label}>Engine Capacity:</Text>
            <Text style={styles.value}>{selectedVehicle.engine_cc} CC</Text>
          </View>
        </View>
      </View>

      {/* Terrain-Aware Recommendation */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🌿 Terrain Recommendation</Text>
        <Text style={styles.infoDesc}>
            {analysis.status === 'SAFE' 
              ? `Your ${selectedVehicle.model} can handle the high-altitude route. We suggest the scenic path via ${destination.name} Viewpoint.`
              : `Due to limited power-to-weight ratio, avoid steep shortcuts. Stay on the main highway to prevent engine overheating.`}
        </Text>
      </View>

      {/* Estimated Costs */}
      <View style={styles.costCard}>
        <Text style={styles.costTitle}>Estimated True Trip Cost</Text>
        <Text style={styles.costValue}>LKR 14,250.00</Text>
        <Text style={styles.costNote}>
            *Includes altitude-based fuel consumption & engine strain factors.
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.finishButton}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.finishText}>PLAN NEW RESEARCH TRIP</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  header: { padding: SIZES.padding, marginTop: 40 },
  title: { ...FONTS.h1, color: COLORS.primary, marginBottom: 5 },
  subtitle: { ...FONTS.body4, color: COLORS.accent, letterSpacing: 1 },
  resultCard: {
    margin: SIZES.padding,
    padding: 20,
    backgroundColor: '#1E1E1E',
    borderRadius: SIZES.radius,
    borderWidth: 1.5,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  scoreHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 15 
  },
  statusText: { fontSize: 28, fontWeight: '900' },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  badgeText: { color: COLORS.black, fontWeight: 'bold', fontSize: 12 },
  justificationText: { color: COLORS.white, lineHeight: 22, fontSize: 16, marginBottom: 15 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 15 },
  techDetails: { marginTop: 10 },
  techTitle: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 10 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { color: COLORS.accent, fontSize: 14 },
  value: { color: COLORS.white, fontSize: 14, fontWeight: '500' },
  infoCard: {
    marginHorizontal: SIZES.padding,
    padding: 20,
    backgroundColor: '#262626',
    borderRadius: SIZES.radius,
    marginBottom: 20
  },
  infoTitle: { color: COLORS.primary, fontWeight: 'bold', marginBottom: 10 },
  infoDesc: { color: COLORS.accent, lineHeight: 22 },
  costCard: {
    marginHorizontal: SIZES.padding,
    padding: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.05)',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.3)',
    marginBottom: 30
  },
  costTitle: { color: COLORS.white, fontWeight: 'bold' },
  costValue: { color: COLORS.primary, fontSize: 32, fontWeight: '900', marginVertical: 10 },
  costNote: { color: COLORS.accent, fontSize: 11, fontStyle: 'italic' },
  finishButton: {
    margin: SIZES.padding,
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginBottom: 50
  },
  finishText: { color: COLORS.black, fontWeight: 'bold', letterSpacing: 1 }
});

export default RecommendationScreen;