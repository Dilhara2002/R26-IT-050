import { useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";

import { router } from "expo-router";

import TourismPromptInput from "../../components/tourism/TourismPromptInput";
import tourismColors from "../../constants/tourism/tourismColors";
import { generateTourismPackage } from "../../services/tourism/tourismApi";

const promptExamples = [
  "Luxury hotel in Kandy with nature activities",
  "Budget hotel in Ella with adventure activities",
  "Beach hotel in Galle with family activities",
];

export default function HomeScreen() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert("Required", "Please enter your travel request.");
      return;
    }

    try {
      setLoading(true);

      const data = await generateTourismPackage(prompt);

      router.push({
        pathname: "/results",
        params: {
          packageData: JSON.stringify(data),
          prompt,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";

      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.aiBadge}>✦ Graph RAG AI</Text>

        <Text style={styles.title}>Plan Sri Lanka with AI</Text>

        <Text style={styles.subtitle}>
          Tell your travel idea in one sentence. The assistant will match hotels,
          activities, location, food type and duration using graph intelligence.
        </Text>
      </View>

      <View style={styles.assistantCard}>
        <View style={styles.assistantHeader}>
          <View style={styles.botCircle}>
            <Text style={styles.botIcon}>🤖</Text>
          </View>

          <View>
            <Text style={styles.cardTitle}>AI Trip Builder</Text>
            <Text style={styles.cardSub}>Hotel + activities package</Text>
          </View>
        </View>

        <TourismPromptInput value={prompt} onChangeText={setPrompt} />

        <Text style={styles.quickTitle}>Try quick prompts</Text>

        <View style={styles.chips}>
          {promptExamples.map((item, index) => (
            <Pressable
              key={index}
              style={styles.chip}
              onPress={() => setPrompt(item)}
            >
              <Text style={styles.chipText}>{item}</Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={tourismColors.primary} />
            <Text style={styles.loadingText}>
              Searching graph and building package...
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={handleGenerate}
            style={({ pressed }) => [
              styles.generateButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.generateText}>Generate Smart Package</Text>
            <Text style={styles.generateIcon}>✨</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.featureGrid}>
        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🏨</Text>
          <Text style={styles.featureTitle}>Hotel Match</Text>
          <Text style={styles.featureText}>Finds hotels by grade, food and district.</Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🌿</Text>
          <Text style={styles.featureTitle}>Activity Match</Text>
          <Text style={styles.featureText}>Selects suitable nearby activities.</Text>
        </View>

        <View style={styles.featureCard}>
          <Text style={styles.featureIcon}>🧠</Text>
          <Text style={styles.featureTitle}>Graph RAG</Text>
          <Text style={styles.featureText}>Uses relationships instead of plain search.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#EAF2FF",
  },

  content: {
    padding: 18,
    paddingBottom: 40,
  },

  hero: {
    backgroundColor: "#1D4ED8",
    borderRadius: 28,
    padding: 26,
    marginBottom: 18,
  },

  aiBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.18)",
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    fontWeight: "800",
    marginBottom: 16,
  },

  title: {
    fontSize: 36,
    fontWeight: "900",
    color: "#FFFFFF",
    marginBottom: 12,
  },

  subtitle: {
    color: "#DBEAFE",
    lineHeight: 23,
    fontSize: 15,
  },

  assistantCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    elevation: 6,
    marginBottom: 20,
  },

  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  botCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  botIcon: {
    fontSize: 25,
  },

  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0F172A",
  },

  cardSub: {
    color: "#64748B",
    marginTop: 3,
  },

  quickTitle: {
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },

  chip: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 18,
  },

  chipText: {
    color: "#1D4ED8",
    fontWeight: "700",
    fontSize: 12,
  },

  generateButton: {
    backgroundColor: "#2563EB",
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  generateText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  generateIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    marginLeft: 8,
  },

  pressed: {
    opacity: 0.75,
  },

  loadingBox: {
    alignItems: "center",
    paddingVertical: 14,
  },

  loadingText: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },

  featureGrid: {
    gap: 12,
  },

  featureCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    elevation: 3,
  },

  featureIcon: {
    fontSize: 28,
    marginBottom: 8,
  },

  featureTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    marginBottom: 4,
  },

  featureText: {
    color: "#64748B",
    lineHeight: 20,
  },
});