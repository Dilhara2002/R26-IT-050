import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../styles/colors";

export default function MobileBackButton({
  onPress,
  label = "Back",
  accessibilityLabel,
  onDark = false,
  compact = false,
  style,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        onDark ? styles.buttonOnDark : styles.buttonDefault,
        compact && styles.compact,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons
        name="chevron-back"
        size={22}
        color={colors.background}
      />
      {compact ? null : (
        <Text style={[styles.label, onDark && styles.labelOnDark]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 48,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  buttonDefault: {
    backgroundColor: colors.primaryDark,
    borderColor: "rgba(255,255,255,0.24)",
  },
  buttonOnDark: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.25)",
  },
  compact: { width: 48, paddingHorizontal: 0 },
  label: { color: colors.background, fontSize: 14, fontWeight: "900" },
  labelOnDark: { color: colors.background },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
