import { useState } from "react";

import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";

import { router } from "expo-router";

import TourismPromptInput from "../../components/tourism/TourismPromptInput";
import tourismColors from "../../constants/tourism/tourismColors";
import { generateTourismPackage } from "../../services/tourism/tourismApi";

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
    <View style={styles.container}>
      <Text style={styles.badge}>Graph RAG Tourism Assistant</Text>

      <Text style={styles.title}>Discover Sri Lanka Smarter</Text>

      <Text style={styles.subtitle}>
        Describe your dream trip using natural language.
      </Text>

      <TourismPromptInput value={prompt} onChangeText={setPrompt} />

      {loading ? (
        <ActivityIndicator size="large" color={tourismColors.primary} />
      ) : (
        <Pressable style={styles.generateButton} onPress={handleGenerate}>
          <Text style={styles.generateButtonText}>✨ Generate Package</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 22,
    justifyContent: "center",
    backgroundColor: tourismColors.background,
  },

  badge: {
    alignSelf: "flex-start",
    backgroundColor: tourismColors.primaryLight,
    color: tourismColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    fontWeight: "800",
    marginBottom: 18,
  },

  title: {
    fontSize: 34,
    fontWeight: "900",
    color: tourismColors.primary,
    marginBottom: 10,
  },

  subtitle: {
    color: tourismColors.textLight,
    marginBottom: 28,
    lineHeight: 22,
  },

  generateButton: {
    backgroundColor: tourismColors.primary,
    padding: 18,
    borderRadius: 18,
    alignItems: "center",
  },

  generateButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
});