import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export default function RiskCard({ risk }) {
  if (!risk) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Historical Risk</Text>

      <Text style={styles.text}>Route: {risk.disasterRoute}</Text>
      <Text style={styles.text}>Risk Type: {risk.riskType}</Text>
      <Text style={styles.text}>Severity: {risk.severity}</Text>
      <Text style={styles.text}>Main Factor: {risk.primaryFactor}</Text>
      <Text style={styles.recommendation}>
        Recommendation: {risk.recommendation}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFF7ED",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FED7AA",
    marginTop: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.warning,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 5,
  },
  recommendation: {
    fontSize: 14,
    color: colors.danger,
    fontWeight: "600",
    marginTop: 8,
  },
});