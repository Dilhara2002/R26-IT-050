import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { COLORS } from '../constants/theme';

export default function PreferenceScreen({ navigation }) {
  const [timeLimit, setTimeLimit] = useState('');
  const [selectedInterests, setSelectedInterests] = useState([]);
  const interestsList = ['Beaches', 'History', 'Nature', 'Culture', 'Wildlife'];

  const handleCheckbox = (interest) => {
    setSelectedInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleSubmit = () => {
    if (!timeLimit || selectedInterests.length === 0) {
      alert("Please enter time and select at least one interest!");
      return;
    }
    // ඊළඟ පිටුවට (Dashboard) දත්තත් අරගෙන යනවා
    navigation.navigate('Dashboard', { timeLimit, selectedInterests });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Itinerary Optimizer</Text>
          <Text style={styles.subtitle}>Set your constraints for the AI</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Available Time (Hours/Day):</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 8"
            placeholderTextColor="#888"
            keyboardType="numeric"
            value={timeLimit}
            onChangeText={setTimeLimit}
          />

          <Text style={styles.label}>Select Your Interests:</Text>
          <View style={styles.chipContainer}>
            {interestsList.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => handleCheckbox(interest)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{interest}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Generate Optimized Route</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary },
  scrollContainer: { padding: 20 },
  header: { marginTop: 20, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: COLORS.primary },
  subtitle: { fontSize: 14, color: COLORS.accent, marginTop: 5 },
  card: { backgroundColor: '#2A2A2A', padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#333' },
  label: { fontSize: 16, color: COLORS.primary, fontWeight: 'bold', marginBottom: 10, marginTop: 15 },
  input: { backgroundColor: COLORS.secondary, color: COLORS.white, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#444', fontSize: 16 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
  chip: { backgroundColor: COLORS.secondary, paddingVertical: 10, paddingHorizontal: 15, borderRadius: 20, borderWidth: 1, borderColor: '#555' },
  chipSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: '#CCC', fontWeight: '600' },
  chipTextSelected: { color: '#000', fontWeight: 'bold' },
  button: { backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 30 },
  buttonText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
});