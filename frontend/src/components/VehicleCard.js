import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function VehicleCard({ vehicle, title = "Recommended Vehicle" }) {
  if (!vehicle) return null;

  return (
    <View style={styles.card}>

      <Text style={styles.title}>{title}</Text>

      <Text style={styles.vehicleName}>
        {vehicle["Vehicle Name (Make & Model)"]}
      </Text>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Category:</Text>
        <Text style={styles.value}>
          {vehicle["Vehicle Category"]}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Fuel Type:</Text>
        <Text style={styles.value}>
          {vehicle["Fuel Type"]}
        </Text>
      </View>

      <View style={styles.infoRow}>
        <Text style={styles.label}>Seats:</Text>
        <Text style={styles.value}>
          {vehicle["Seating Capacity"]}
        </Text>
      </View>

      <View style={styles.scoreBox}>
        <Text style={styles.scoreText}>
          Safety Score: {vehicle.safetyScore}
        </Text>
      </View>

      <View style={styles.costBox}>
        <Text style={styles.costText}>
          Estimated Cost: LKR {vehicle.calculatedCost}
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
    marginTop: 16,
    elevation: 3,
  },

  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
    marginBottom: 8,
  },

  vehicleName: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 12,
  },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },

  value: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },

  scoreBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
  },

  scoreText: {
    fontWeight: "800",
    color: "#1D4ED8",
    fontSize: 13,
  },

  costBox: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
  },

  costText: {
    fontWeight: "800",
    color: "#0F172A",
    fontSize: 13,
  },
});