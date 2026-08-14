import {
  View,
  Text,
  Image,
  StyleSheet,
} from "react-native";

import tourismColors from "../../constants/tourism/tourismColors";

export default function TourismCard({
  title,
  subtitle,
  description,
  image,
  tags = [],
  type = "hotel",
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {type === "hotel" ? "🏨" : "🌿"}
          </Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.title}>
            {title}
          </Text>

          <Text style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Text style={styles.description}>
        {description}
      </Text>

      {image ? (
        <Image
          source={{ uri: image }}
          style={styles.image}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderIcon}>
            🌍
          </Text>
        </View>
      )}

      <View style={styles.tags}>
        {tags.map((tag, index) => (
          <View key={index} style={styles.tag}>
            <Text style={styles.tagText}>
              {tag}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tourismColors.white,
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
    justifyContent: "center",
    alignItems: "center",
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
    lineHeight: 21,
    color: "#334155",
  },

  image: {
    width: "100%",
    height: 190,
  },

  placeholder: {
    width: "100%",
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: tourismColors.primaryLight,
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
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  tagText: {
    fontWeight: "700",
    fontSize: 12,
    color: "#334155",
  },
});