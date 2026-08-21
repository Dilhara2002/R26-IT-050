import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../styles/colors";

export default function VehicleCard({
  vehicle,
  title = "Vehicle",
}) {
  if (!vehicle) return null;

  const vehicleName =
    vehicle["Vehicle Name (Make & Model)"] ||
    vehicle.model ||
    "Unknown Vehicle";

  const category =
    vehicle["Vehicle Category"] ||
    vehicle.vehicleCategory ||
    "Unknown";

  const fuelType =
    vehicle["Fuel Type"] ||
    "Unknown";

  const seats =
    vehicle["Seating Capacity"] ||
    vehicle.seatingCapacity ||
    "Unknown";

  const estimatedCost =
    vehicle.estimatedHirePrice ??
    vehicle.calculatedCost ??
    null;

  const suitability =
    vehicle.vehicleSuitability;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {title}
      </Text>

      <Text style={styles.vehicleName}>
        {vehicleName}
      </Text>

      <Text style={styles.text}>
        Category: {category}
      </Text>

      <Text style={styles.text}>
        Fuel Type: {fuelType}
      </Text>

      <Text style={styles.text}>
        Seats: {seats}
      </Text>

      {suitability && (
        <>
          <Text style={styles.text}>
            Gradeability: {suitability.gradeability}%
          </Text>

          <Text style={styles.text}>
            Required Road Gradient:{" "}
            {suitability.roadGradient ?? "Unavailable"}
            {suitability.roadGradient !== null &&
              suitability.roadGradient !== undefined
              ? "%"
              : ""}
          </Text>

          <Text style={styles.text}>
            Capability Margin:{" "}
            {suitability.gradeabilityMargin ?? "Unavailable"}
            {suitability.gradeabilityMargin !== null &&
              suitability.gradeabilityMargin !== undefined
              ? "%"
              : ""}
          </Text>

          <Text
            style={[
              styles.text,
              suitability.suitableForGradient === true
                ? styles.suitable
                : suitability.suitableForGradient === false
                  ? styles.unsuitable
                  : null,
            ]}
          >
            Road Suitability:{" "}
            {suitability.suitableForGradient === true
              ? "Suitable"
              : suitability.suitableForGradient === false
                ? "Not Suitable"
                : "Unknown (gradient unavailable)"}
          </Text>
        </>
      )}

      <Text style={styles.price}>
        Estimated Cost:{" "}
        {estimatedCost !== null
          ? `LKR ${Number(estimatedCost).toLocaleString()}`
          : "Unavailable"}
      </Text>
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

  price: {
    fontSize: 16,
    color: colors.text,
    fontWeight: "700",
    marginTop: 8,
  },

  suitable: {
    color: "#15803D",
    fontWeight: "700",
  },

  unsuitable: {
    color: "#B91C1C",
    fontWeight: "700",
  },
});
