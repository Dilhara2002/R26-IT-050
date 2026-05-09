import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import tourismColors from "../theme/tourismColors";

export default function TourismPromptInput({
  inputLabel = "Travel Prompt",
  placeholder = "",
  value = "",
  icon = "🔍",
  height = 150,
  onChangeText,
}) {
  const [userValue, setUserValue] = useState(value);

  useEffect(() => {
    setUserValue(value);
  }, [value]);

  const handleChange = (text) => {
    setUserValue(text);
    onChangeText?.(text);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{inputLabel}</Text>

      <View style={[styles.inputBox, { height }]}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          value={userValue}
          onChangeText={handleChange}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.icon}>{icon}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: tourismColors.textDark,
    marginBottom: 8,
  },
  inputBox: {
    backgroundColor: tourismColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tourismColors.border,
    position: "relative",
    elevation: 3,
  },
  input: {
    flex: 1,
    padding: 16,
    paddingRight: 48,
    fontSize: 15,
    color: tourismColors.textDark,
    lineHeight: 22,
  },
  icon: {
    position: "absolute",
    right: 16,
    top: 14,
    fontSize: 22,
  },
});