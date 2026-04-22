import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { COLORS, SIZES, FONTS } from '../constants/theme';
import data from '../constants/data.json';

const HomeScreen = ({ navigation }) => {
  const [budget, setBudget] = useState('');
  const [passengers, setPassengers] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Intelligent Mobility</Text>
        <Text style={styles.subtitle}>Plan your safe journey in Sri Lanka</Text>
      </View>

      <View style={styles.form}>
        {/* Budget Input */}
        <Text style={styles.label}>Your Budget (LKR)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 50000"
          placeholderTextColor="#666"
          keyboardType="numeric"
          value={budget}
          onChangeText={setBudget}
        />

        {/* Passenger Count */}
        <Text style={styles.label}>Number of Passengers</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 4"
          placeholderTextColor="#666"
          keyboardType="numeric"
          value={passengers}
          onChangeText={setPassengers}
        />

        {/* Vehicle Selection */}
        <Text style={styles.label}>Preferred Vehicle</Text>
        <View style={styles.vehicleList}>
          {data.vehicles.map((vehicle) => (
            <TouchableOpacity
              key={vehicle.id}
              style={[
                styles.vehicleCard,
                selectedVehicle?.id === vehicle.id && styles.selectedCard,
              ]}
              onPress={() => setSelectedVehicle(vehicle)}
            >
              <Text style={styles.vehicleText}>{vehicle.model}</Text>
              <Text style={styles.vehicleSubText}>{vehicle.engine_cc}cc</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Start Planning Button */}
        <TouchableOpacity 
          style={styles.button}
          onPress={() => navigation.navigate('MapDetails', { budget, passengers, selectedVehicle })}
        >
          <Text style={styles.buttonText}>Check Safety & Route</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  header: { padding: SIZES.padding, marginTop: 40 },
  title: { ...FONTS.h1, color: COLORS.primary },
  subtitle: { ...FONTS.body, color: COLORS.accent, marginTop: 5 },
  form: { padding: SIZES.padding },
  label: { ...FONTS.body, color: COLORS.primary, marginBottom: 10, fontWeight: 'bold' },
  input: {
    backgroundColor: '#2A2A2A',
    color: COLORS.white,
    padding: 15,
    borderRadius: SIZES.radius,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  vehicleList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  vehicleCard: {
    backgroundColor: '#2A2A2A',
    width: '48%',
    padding: 15,
    borderRadius: SIZES.radius,
    marginBottom: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  selectedCard: { borderColor: COLORS.primary, borderWidth: 2 },
  vehicleText: { color: COLORS.white, fontWeight: 'bold' },
  vehicleSubText: { color: COLORS.accent, fontSize: 12 },
  button: {
    backgroundColor: COLORS.primary,
    padding: 18,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: { color: COLORS.black, fontWeight: 'bold', fontSize: 18 },
});

export default HomeScreen;