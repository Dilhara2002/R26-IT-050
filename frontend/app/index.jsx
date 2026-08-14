import React from "react";
import { router } from "expo-router";
import { Pressable, Text, View, StyleSheet } from "react-native";

export default function Welcome() {
  return (
    <View style={styles.page}>
      <Text style={styles.badge}>Sri Lanka Smart Travel</Text>
      <Text style={styles.title}>One plan. Safer journeys.</Text>
      <Text style={styles.subtitle}>Match hotels and activities, optimize your route, then check risk and the best vehicle for the journey.</Text>
      <Pressable style={styles.button} onPress={() => router.push("/plan")}><Text style={styles.buttonText}>Start planning</Text></Pressable>
      <View style={styles.links}>
        <Pressable onPress={() => router.push("/trips")}><Text style={styles.link}>Trips</Text></Pressable>
        <Pressable onPress={() => router.push("/profile")}><Text style={styles.link}>Profile</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#1d4ed8", justifyContent: "center", alignItems: "center", padding: 28 },
  badge: { color: "#bfdbfe", fontWeight: "800", marginBottom: 16 },
  title: { color: "#fff", fontSize: 42, fontWeight: "900", textAlign: "center", maxWidth: 650 },
  subtitle: { color: "#dbeafe", fontSize: 17, textAlign: "center", lineHeight: 25, marginTop: 16, maxWidth: 650 },
  button: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 28, paddingVertical: 16, marginTop: 28 },
  buttonText: { color: "#1d4ed8", fontWeight: "900", fontSize: 16 },
  links: { flexDirection: "row", gap: 24, marginTop: 24 },
  link: { color: "#fff", fontWeight: "700" },
});
