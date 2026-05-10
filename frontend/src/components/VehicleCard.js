/**
 * Component: VehicleCard
 * Branch: safety-analyzer-Graphrag
 * Purpose: Displays vehicle details. Safety Score is hidden to prioritize GraphRAG reasoning.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export default function VehicleCard({ vehicle, title = "Recommended Vehicle" }) {
  if (!vehicle) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.headerTag}>{title}</Text>

      <Text style={styles.vehicleName}>
        {vehicle["Vehicle Name (Make & Model)"] || "Standard Vehicle"}
      </Text>

      <View style={styles.infoSection}>
        <Text style={styles.detailText}>
          <Text style={styles.label}>Category: </Text>
          {vehicle["Vehicle Category"]}
        </Text>
        
        <Text style={styles.detailText}>
          <Text style={styles.label}>Fuel Type: </Text>
          {vehicle["Fuel Type"]}
        </Text>
        
        <Text style={styles.detailText}>
          <Text style={styles.label}>Capacity: </Text>
          {vehicle["Seating Capacity"]} Passengers
        </Text>

        <View style={styles.divider} />

        <Text style={styles.priceText}>
          Estimated Hire: LKR {vehicle.calculatedCost}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTag: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  vehicleName: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 12,
  },
  infoSection: {
    gap: 4,
  },
  detailText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  label: {
    fontWeight: "600",
    color: colors.muted,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  priceText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.primaryDark,
  },
});