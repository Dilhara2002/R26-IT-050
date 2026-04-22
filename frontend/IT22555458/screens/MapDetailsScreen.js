import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import data from '../constants/data.json';

const MapDetailsScreen = ({ route, navigation }) => {
  // HomeScreen එකෙන් එවන දත්ත ලබා ගැනීම
  const { budget, passengers, selectedVehicle } = route.params;
  
  // පර්යේෂණයේ අවශ්‍යතාවය පරිදි දැනට Mock Destination එකක් ලෙස Nuwara Eliya තෝරා ගනිමු
  const destination = data.destinations[0]; 

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Route Analysis</Text>
        <Text style={styles.subtitle}>Analyzing terrain for {selectedVehicle?.model}</Text>
      </View>

      {/* Map Placeholder - පසුව Mapbox මෙතැනට සම්බන්ධ කරයි */}
      <View style={styles.mapContainer}>
        <Text style={styles.mapText}>Interactive Map Visualization</Text>
        <Text style={styles.subMapText}>[Mapbox SDK - Route to {destination.name}]</Text>
      </View>

      <View style={styles.infoSection}>
        {/* Terrain Gradient Chart Placeholder */}
        <Text style={styles.sectionTitle}>Road Gradient Profile</Text>
        <View style={styles.chartPlaceholder}>
           <Text style={styles.chartText}>Elevation: {destination.max_gradient}% Max Slope Detected</Text>
        </View>

        {/* Live Contextual Data Alerts */}
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠️ Live Safety Alerts (DMC)</Text>
          <Text style={styles.alertDesc}>Heavy rain reported in {destination.danger_zones[0]}. Landslide risk: Moderate.</Text>
        </View>

        {/* Action Button to Reasoning Engine */}
        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.navigate('Recommendation', { 
            budget, 
            passengers, 
            selectedVehicle, 
            destination 
          })}
        >
          <Text style={styles.buttonText}>Generate AI Recommendation</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  header: { padding: SIZES.padding, marginTop: 40 },
  title: { ...FONTS.h1, color: COLORS.primary },
  subtitle: { ...FONTS.body, color: COLORS.accent },
  mapContainer: {
    height: 300,
    backgroundColor: '#2A2A2A',
    margin: SIZES.padding,
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444'
  },
  mapText: { color: COLORS.primary, fontWeight: 'bold' },
  subMapText: { color: COLORS.accent, fontSize: 12 },
  infoSection: { padding: SIZES.padding },
  sectionTitle: { ...FONTS.h2, color: COLORS.white, marginBottom: 15 },
  chartPlaceholder: {
    height: 100,
    backgroundColor: '#333',
    borderRadius: SIZES.radius,
    justifyContent: 'center',
    padding: 15,
    marginBottom: 20
  },
  chartText: { color: COLORS.primary, fontWeight: '500' },
  alertCard: {
    backgroundColor: 'rgba(255, 76, 76, 0.1)',
    padding: 15,
    borderRadius: SIZES.radius,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.danger,
    marginBottom: 25
  },
  alertTitle: { color: COLORS.danger, fontWeight: 'bold', marginBottom: 5 },
  alertDesc: { color: COLORS.accent, fontSize: 13 },
  button: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: SIZES.radius,
    alignItems: 'center'
  },
  buttonText: { color: COLORS.black, fontWeight: 'bold', fontSize: 16 }
});

export default MapDetailsScreen;