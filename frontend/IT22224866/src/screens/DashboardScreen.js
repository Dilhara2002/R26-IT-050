import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/theme';

export default function DashboardScreen({ route }) {
  // කලින් පිටුවෙන් එවපු ඩේටා ටික අල්ලගන්නවා
  const { timeLimit, selectedInterests } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Generating Route...</Text>
      <Text style={styles.text}>Time Limit: {timeLimit} Hours</Text>
      <Text style={styles.text}>Interests: {selectedInterests.join(', ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, color: COLORS.primary, fontWeight: 'bold', marginBottom: 10 },
  text: { fontSize: 16, color: COLORS.white },
});