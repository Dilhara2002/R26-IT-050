import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";

function ImagePreview({ id, name, required, onChange, imageUri }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={styles.container}
      onPress={() => onChange?.(null)}
    >
      <View style={styles.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <Text style={styles.camera}>📷</Text>
        )}
      </View>

      <Text style={styles.path}>
        {imageUri ? "Image Selected" : "Choose File"}
      </Text>
    </TouchableOpacity>
  );
}

export default ImagePreview;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 20,
  },
  preview: {
    width: 125,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#93C5FD",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    backgroundColor: "#F8FAFC",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  camera: {
    fontSize: 42,
    opacity: 0.6,
  },
  path: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
  },
});