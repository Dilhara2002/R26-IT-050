import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function RiskCard({ risk }) {
  if (!risk) return null;

  return (
    <View style={styles.card}>
      
      <Text style={styles.header}>Risk Insight</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Route:</Text>
        <Text style={styles.value}>{risk.disasterRoute}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Risk Type:</Text>
        <Text style={styles.value}>{risk.riskType}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Severity:</Text>
        <Text style={[styles.value, styles.severity]}>
          {risk.severity}
        </Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Main Factor:</Text>
        <Text style={styles.value}>{risk.primaryFactor}</Text>
      </View>

      <View style={styles.recommendBox}>
        <Text style={styles.recommendText}>
          {risk.recommendation}
        </Text>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    marginTop: 12,
    elevation: 3,
  },

  header: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12,
    color: "#0F172A",
  },

  row: {
    marginBottom: 6,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },

  value: {
    fontSize: 14,
    color: "#334155",
  },

  severity: {
    fontWeight: "900",
    color: "#DC2626",
  },

  recommendBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
  },

  recommendText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
});