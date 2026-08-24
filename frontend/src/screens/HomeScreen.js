import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export default function HomeScreen({ onStart, onBack }) {
  return (
    <View style={styles.container}>
      {onBack && <TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backText}>← Dashboard</Text></TouchableOpacity>}
      <Text style={styles.logo}>🛡️</Text>

      <Text style={styles.title}>SafeTrip AI</Text>

      <Text style={styles.subtitle}>
        AI-powered Sri Lankan tourism safety recommendation system using ML and
        Neo4j GraphRAG.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onStart}>
        <Text style={styles.buttonText}>Start Safety Check</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 24,
    flex: 1,
    justifyContent: "center",
  },
  backButton: { position: "absolute", top: 24, left: 24, paddingVertical: 10 },
  backText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  logo: {
    fontSize: 60,
    textAlign: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: "bold",
    color: colors.primaryDark,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
    marginTop: 14,
    marginBottom: 30,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "bold",
  },
});
