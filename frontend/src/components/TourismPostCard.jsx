import { View, Text, Image, StyleSheet } from "react-native";
import tourismColors from "../theme/tourismColors";

export default function TourismPostCard({ item, type = "hotel" }) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{type === "hotel" ? "🏨" : "🌿"}</Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </View>
      </View>

      <Text style={styles.description}>{item.description}</Text>

      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.image} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderIcon}>{type === "hotel" ? "🏝️" : "🌄"}</Text>
        </View>
      )}

      <View style={styles.tags}>
        {item.tags?.map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tourismColors.card,
    borderRadius: 20,
    marginBottom: 18,
    overflow: "hidden",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tourismColors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  avatarText: {
    fontSize: 22,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: tourismColors.textDark,
  },
  subtitle: {
    fontSize: 13,
    color: tourismColors.textLight,
    marginTop: 3,
  },
  description: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
  },
  image: {
    width: "100%",
    height: 190,
  },
  imagePlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: tourismColors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderIcon: {
    fontSize: 42,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 14,
    gap: 8,
  },
  tag: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tagText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
});