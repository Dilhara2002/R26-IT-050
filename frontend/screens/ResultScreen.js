import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";

// navigation prop එක මෙතනට අනිවාර්යයෙන්ම ඇතුළත් කරන්න
export default function ResultScreen({ route, navigation }) {

  const { data } = route.params;

  return (
    <ScrollView style={styles.container}>
      
      <Text style={styles.header}>Optimized Route ✨</Text>

      {/* View on Map Button */}
      <TouchableOpacity 
        style={styles.mapBtn}
        onPress={() => navigation.navigate("Map", { itineraryData: data })}
      >
        <Text style={styles.mapBtnText}>View on Map 🗺️</Text>
      </TouchableOpacity>

      <View style={styles.routeContainer}>
        {data.optimized_route.map((place, index) => (
          <View key={index} style={styles.placeItem}>
            <Text style={styles.placeText}>{index + 1}. {place}</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.timeText}>⏱️ Total Estimated Time: {data.estimated_time_required}</Text>
        
        <Text style={styles.aiTitle}>AI Explanation (XAI):</Text>
        <Text style={styles.aiSummary}>{data.ai_summary}</Text>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff" },
  header: { fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: 'center' },
  mapBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 10, marginBottom: 25 },
  mapBtnText: { color: '#fff', textAlign: 'center', fontWeight: 'bold', fontSize: 16 },
  routeContainer: { marginBottom: 20 },
  placeItem: { padding: 15, backgroundColor: "#f0f0f0", borderRadius: 8, marginVertical: 5 },
  placeText: { fontSize: 16, color: "#333" },
  infoBox: { marginTop: 10, paddingBottom: 40 },
  timeText: { fontSize: 18, fontWeight: "600", color: "#2c3e50" },
  aiTitle: { fontSize: 18, fontWeight: "bold", marginTop: 20, color: "#e67e22" },
  aiSummary: { fontSize: 15, lineHeight: 22, marginTop: 10, color: "#555", textAlign: 'justify' }
});