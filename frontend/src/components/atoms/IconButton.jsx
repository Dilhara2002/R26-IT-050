import { TouchableOpacity, Text, StyleSheet } from "react-native";

function IconButton({
  content,
  title,
  iconb,
  icona,
  w,
  h,
  size,
  bg = "#2563EB",
  c = "#FFFFFF",
  is = 20,
  ts = 14,
  rm = 0,
  lm = 0,
  tm = 0,
  bm = 0,
  extraClass,
  onClick,
  onPress,
}) {
  const width = w || size || "100%";
  const height = h || size || 44;

  const bgColor =
    bg === "green"
      ? "#22C55E"
      : bg === "red"
      ? "#EF4444"
      : bg === "blue"
      ? "#2563EB"
      : bg === "yellow"
      ? "#EAB308"
      : bg || "#2563EB";

  const textColor =
    c === "white"
      ? "#FFFFFF"
      : c === "green"
      ? "#22C55E"
      : c === "red"
      ? "#EF4444"
      : c === "blue"
      ? "#2563EB"
      : c || "#FFFFFF";

  const isMinimal = extraClass === "minimal";

  return (
    <TouchableOpacity
      accessibilityLabel={title}
      activeOpacity={0.8}
      onPress={onPress || onClick}
      style={[
        styles.button,
        {
          width,
          height,
          backgroundColor: isMinimal ? "transparent" : bgColor,
          marginRight: rm,
          marginLeft: lm,
          marginTop: tm,
          marginBottom: bm,
        },
      ]}
    >
      {iconb ? (
        <Text style={[styles.icon, { fontSize: is, color: textColor }]}>
          {iconb}
        </Text>
      ) : null}

      {content ? (
        <Text style={[styles.text, { fontSize: ts, color: textColor }]}>
          {content}
        </Text>
      ) : null}

      {icona ? (
        <Text style={[styles.icon, { fontSize: is, color: textColor }]}>
          {icona}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default IconButton;

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: 14,
  },
  icon: {
    marginHorizontal: 4,
  },
  text: {
    fontWeight: "600",
  },
});