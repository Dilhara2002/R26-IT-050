import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

function DropdownMenu({
  extraClass,
  labelFront,
  placeholder = "Select one",
  value = "",
  name = "",
  inputLabel = "",
  height = 40,
  required,
  options = [],
  onChange,
}) {
  const [userValue, setValue] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setValue(value);
  }, [value]);

  const selectedLabel =
    options.find((option) => option.value === userValue)?.label || placeholder;

  const handleSelect = (option) => {
    setValue(option.value);
    setOpen(false);

    onChange?.({
      target: {
        name,
        value: option.value,
        required,
      },
    });
  };

  return (
    <View style={[styles.container, labelFront && styles.labelFront]}>
      {inputLabel ? <Text style={styles.label}>{inputLabel}</Text> : null}

      <TouchableOpacity
        style={[styles.selectBox, { height }]}
        activeOpacity={0.8}
        onPress={() => setOpen(!open)}
      >
        <Text style={userValue ? styles.selectedText : styles.placeholder}>
          {selectedLabel}
        </Text>
        <Text style={styles.arrow}>{open ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {open ? (
        <View style={styles.optionsBox}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={styles.option}
              onPress={() => handleSelect(option)}
            >
              <Text style={styles.optionText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default DropdownMenu;

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
  selectBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedText: {
    color: "#0F172A",
    fontSize: 14,
  },
  placeholder: {
    color: "#94A3B8",
    fontSize: 14,
  },
  arrow: {
    color: "#64748B",
    fontSize: 12,
  },
  optionsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginTop: 6,
    overflow: "hidden",
  },
  option: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  optionText: {
    color: "#334155",
    fontSize: 14,
  },
});