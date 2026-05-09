import { TouchableOpacity, Text, StyleSheet } from "react-native";
import tourismColors from "../theme/tourismColors";

export default function TourismGenerateButton({
  title = "Generate Package",
  icon = "✨",
  onPress,
  disabled = false,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.text}>{title}</Text>
      <Text style={styles.icon}>{icon}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    backgroundColor: tourismColors.primary,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    elevation: 4,
  },
  disabled: {
    backgroundColor: "#93C5FD",
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  icon: {
    color: "#FFFFFF",
    fontSize: 18,
    marginLeft: 8,
  },
});