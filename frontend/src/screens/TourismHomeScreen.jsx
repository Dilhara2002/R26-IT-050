import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import TourismPromptInput from "../components/TourismPromptInput";
import TourismGenerateButton from "../components/TourismGenerateButton";
import { generateTourismPackage } from "../services/tourismApi";
import tourismColors from "../theme/tourismColors";

export default function TourismHomeScreen({ navigation }) {
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

      navigation.navigate("TourismResults", {
        prompt,
        packageData: data,
      });
    } catch (error) {
      Alert.alert("Request Failed", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.badge}>Graph RAG Travel Assistant</Text>

        <Text style={styles.title}>Discover Sri Lanka Smarter</Text>

        <Text style={styles.subtitle}>
          Type one natural language request and get a hotel plus suitable activities from your Graph RAG backend.
        </Text>

        <TourismPromptInput
          value={prompt}
          onChangeText={setPrompt}
          placeholder="I want luxury type hotel with non veg for three days in Kandy with nature activities"
        />

        {loading ? (
          <ActivityIndicator size="large" color={tourismColors.primary} />
        ) : (
          <TourismGenerateButton onPress={handleGenerate} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: tourismColors.background,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: tourismColors.primaryLight,
    color: tourismColors.primary,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: "900",
    color: tourismColors.primary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: tourismColors.textLight,
    lineHeight: 23,
    marginBottom: 28,
  },
});