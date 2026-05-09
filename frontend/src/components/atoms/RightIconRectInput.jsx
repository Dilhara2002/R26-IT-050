import { useState, useEffect } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";

function RightIconRectInput({
  labelFront = false,
  placeholder = "",
  value = "",
  name = "",
  inputLabel = "",
  icon,
  height = 40,
  type = "text",
  required,
  onChange,
  onChangeText,
  extraClass,
  multiline = false,
}) {
  const [userValue, setValue] = useState(value);

  useEffect(() => {
    setValue(value);
  }, [value]);

  const handleChange = (text) => {
    setValue(text);

    const eventLikeObject = {
      target: {
        name,
        value: text,
        required,
      },
    };

    onChange?.(eventLikeObject);
    onChangeText?.(text);
  };

  return (
    <View style={[styles.container, labelFront && styles.labelFront]}>
      {inputLabel ? <Text style={styles.label}>{inputLabel}</Text> : null}

      <View style={[styles.inputBox, { height }]}>
        <TextInput
          style={[
            styles.input,
            icon && styles.inputWithIcon,
            multiline && styles.multiline,
          ]}
          placeholder={placeholder}
          value={userValue}
          onChangeText={handleChange}
          secureTextEntry={type === "password"}
          keyboardType={type === "email" ? "email-address" : "default"}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          placeholderTextColor="#94A3B8"
        />

        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      </View>
    </View>
  );
}

export default RightIconRectInput;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    marginBottom: 14,
  },
  labelFront: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  inputBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    position: "relative",
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  inputWithIcon: {
    paddingRight: 45,
  },
  multiline: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  icon: {
    position: "absolute",
    right: 12,
    fontSize: 22,
    color: "#64748B",
  },
});