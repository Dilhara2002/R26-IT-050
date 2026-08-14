import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Page({ title, subtitle, children }) {
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export const sharedStyles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: "#dbe5f2" },
  label: { color: "#334155", fontWeight: "700", marginBottom: 7 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, padding: 13, marginBottom: 15, backgroundColor: "#fff", color: "#0f172a" },
  button: { backgroundColor: "#2563eb", borderRadius: 13, padding: 15, alignItems: "center", marginBottom: 12 },
  secondaryButton: { backgroundColor: "#e0e7ff" },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryButtonText: { color: "#1d4ed8" },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  muted: { color: "#64748b", lineHeight: 21 },
  error: { color: "#b91c1c", backgroundColor: "#fee2e2", padding: 12, borderRadius: 10, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#93c5fd", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, margin: 4 },
  chipSelected: { backgroundColor: "#2563eb" },
  chipText: { color: "#1d4ed8", fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#eef4ff" },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", padding: 18, paddingBottom: 60 },
  header: { backgroundColor: "#1d4ed8", padding: 24, borderRadius: 22, marginBottom: 18 },
  title: { color: "#fff", fontSize: 30, fontWeight: "900" },
  subtitle: { color: "#dbeafe", marginTop: 8, lineHeight: 21 },
});
