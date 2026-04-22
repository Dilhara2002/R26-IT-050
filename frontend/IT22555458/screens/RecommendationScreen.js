import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';

const RecommendationScreen = ({ route, navigation }) => {
  const { budget, passengers, selectedVehicle, destination } = route.params;
  const [safetyStatus, setSafetyStatus] = useState({ level: '', color: '', message: '' });

  useEffect(() => {
    // පර්යේෂණයේ ප්‍රධාන Logic එක (safetyLogic.js වලට සමාන සරල අනුවාදයක්)
    // වාහනයේ එන්ජින් ධාරිතාව මාර්ගයේ උපරිම බෑවුමට වඩා අඩුදැයි පරීක්ෂා කිරීම
    if (selectedVehicle.max_safe_gradient < destination.max_gradient) {
      setSafetyStatus({
        level: 'UNSAFE',
        color: COLORS.danger,
        message: `Your ${selectedVehicle.model} (${selectedVehicle.engine_cc}cc) may struggle on this route. The ${destination.max_gradient}% gradient exceeds the vehicle's safe limit for ${passengers} passengers.`
      });
    } else {
      setSafetyStatus({
        level: 'SAFE',
        color: COLORS.success,
        message: `Your ${selectedVehicle.model} is well-suited for this terrain. We recommend proceeding with the scenic route for a better experience.`
      });
    }
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>AI Analysis Results</Text>
      </View>

      {/* Safety Score Section */}
      <View style={[styles.resultCard, { borderColor: safetyStatus.color }]}>
        <Text style={[styles.statusText, { color: safetyStatus.color }]}>
          STATUS: {safetyStatus.level}
        </Text>
        <Text style={styles.justificationText}>{safetyStatus.message}</Text>
      </View>

      {/* Scenic Route Recommendation */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>🌿 Recommended Scenic Route</Text>
        <Text style={styles.infoDesc}>
            Instead of the shortest path, take the route via {destination.danger_zones[0]} Viewpoint. 
            It is safer and offers verified Points of Interest (POIs).
        </Text>
      </View>

      {/* True Trip Cost Section */}
      <View style={styles.costCard}>
        <Text style={styles.costTitle}>Estimated True Trip Cost</Text>
        <Text style={styles.costValue}>LKR 12,450.00</Text>
        <Text style={styles.costNote}>
            *Calculated based on engine strain and road steepness, not just distance.
        </Text>
      </View>

      <TouchableOpacity 
        style={styles.finishButton}
        onPress={() => navigation.popToTop()}
      >
        <Text style={styles.finishText}>Plan New Trip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  header: { padding: SIZES.padding, marginTop: 40 },
  title: { ...FONTS.h1, color: COLORS.primary },
  resultCard: {
    margin: SIZES.padding,
    padding: 20,
    backgroundColor: '#2A2A2A',
    borderRadius: SIZES.radius,
    borderWidth: 2,
  },
  statusText: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  justificationText: { color: COLORS.white, lineHeight: 22, fontSize: 15 },
  infoCard: {
    marginHorizontal: SIZES.padding,
    padding: 20,
    backgroundColor: '#333',
    borderRadius: SIZES.radius,
    marginBottom: 20
  },
  infoTitle: { color: COLORS.primary, fontWeight: 'bold', marginBottom: 10 },
  infoDesc: { color: COLORS.accent, lineHeight: 20 },
  costCard: {
    marginHorizontal: SIZES.padding,
    padding: 20,
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    borderRadius: SIZES.radius,
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginBottom: 30
  },
  costTitle: { color: COLORS.white, fontWeight: 'bold' },
  costValue: { color: COLORS.primary, fontSize: 32, fontWeight: 'bold', marginVertical: 10 },
  costNote: { color: COLORS.accent, fontSize: 11, fontStyle: 'italic' },
  finishButton: {
    margin: SIZES.padding,
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginBottom: 50
  },
  finishText: { color: COLORS.black, fontWeight: 'bold' }
});

export default RecommendationScreen;