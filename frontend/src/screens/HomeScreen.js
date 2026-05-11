import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { colors } from "../styles/colors";

export default function HomeScreen({ onStart }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      
      {/* HERO SECTION */}
      <View style={styles.hero}>
        <Text style={styles.logo}>🚗</Text>

        <Text style={styles.title}>Smart Vehicle Advisor</Text>

        <Text style={styles.subtitle}>
          AI-powered vehicle recommendation system for safe and efficient
          travel planning in Sri Lanka.
        </Text>
      </View>

      {/* MAIN CARD */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Find the Best Vehicle for Your Trip
        </Text>

        <Text style={styles.cardText}>
          Enter your route details and get intelligent vehicle suggestions
          based on safety, budget and passenger count.
        </Text>

        <TouchableOpacity style={styles.button} onPress={onStart}>
          <Text style={styles.buttonText}>Start Vehicle Suggestion</Text>
          <Text style={styles.buttonIcon}>🚘</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#EAF2FF",
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 28,
    padding: 26,
    marginBottom: 18,
    alignItems: "center",
  },

  logo: {
    fontSize: 55,
    marginBottom: 10,
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
    textAlign: "center",
  },

  subtitle: {
    color: "#DBEAFE",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
  },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 20,
    elevation: 5,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 8,
  },

  cardText: {
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 18,
  },

  button: {
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonIcon: {
    color: "#FFFFFF",
    marginLeft: 8,
  },
});