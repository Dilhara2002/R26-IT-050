import { View, Text, TextInput, StyleSheet } from "react-native";

import tourismColors from "../../constants/tourism/tourismColors";

export default function TourismPromptInput({
  value,
  onChangeText,
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        Travel Prompt
      </Text>

      <View style={styles.inputBox}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          multiline
          placeholder="I want luxury type hotel with non veg for three days in Kandy with nature activities"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          textAlignVertical="top"
        />

        <Text style={styles.icon}>🔍</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },

  label: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    color: tourismColors.textDark,
  },

  inputBox: {
    height: 160,
    backgroundColor: tourismColors.white,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tourismColors.border,
    position: "relative",
  },

  input: {
    flex: 1,
    padding: 16,
    paddingRight: 50,
    color: tourismColors.textDark,
    fontSize: 15,
    lineHeight: 22,
  },

  icon: {
    position: "absolute",
    top: 14,
    right: 16,
    fontSize: 22,
  },
});