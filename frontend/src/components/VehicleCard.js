import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export default function VehicleCard({ vehicle, title = "Vehicle" }) {
  if (!vehicle) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <Text style={styles.vehicleName}>
        {vehicle["Vehicle Name (Make & Model)"]}
      </Text>

      <Text style={styles.text}>Category: {vehicle["Vehicle Category"]}</Text>
      <Text style={styles.text}>Fuel Type: {vehicle["Fuel Type"]}</Text>
      <Text style={styles.text}>Seats: {vehicle["Seating Capacity"]}</Text>
      <Text style={styles.text}>Safety Score: {vehicle.safetyScore}</Text>
      <Text style={styles.text}>Estimated Cost: LKR {vehicle.calculatedCost}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 16,
  },
  title: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: "700",
    marginBottom: 8,
  },
  vehicleName: {
    fontSize: 19,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 10,
  },
  text: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: 5,
  },
});