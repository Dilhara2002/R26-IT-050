import React, { useState } from "react";
import {
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";

import { getVehicleRecommendation } from "./src/api/safetyApi";
import { colors } from "./src/styles/colors";

import HomeScreen from "./src/screens/HomeScreen";
import TripInputScreen from "./src/screens/TripInputScreen";
import ResultScreen from "./src/screens/ResultScreen";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    budget: "",
    passengers: "",
    startLocation: "",
    endLocation: "",
    preferredVehicle: "",
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);

      // Reset previous states
      setResult(null);
      setErrorMessage("");

      const response = await getVehicleRecommendation({
        budget: Number(form.budget),
        passengers: Number(form.passengers),
        startLocation: form.startLocation,
        endLocation: form.endLocation,
        preferredVehicle: form.preferredVehicle,
        isRaining: form.isRaining,
      });

      // Check if response is empty
      if (!response) {
  setErrorMessage("Failed to fetch recommendation.");
  setScreen("result");
  return;
}

      setResult(response);
      setScreen("result");
    } catch (error) {
      console.log("Recommendation Error:", error);

      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to generate recommendation. Please try again.";

      setErrorMessage(message);
      setResult(null);

      setScreen("result");

      Alert.alert("Recommendation Error", message);
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    setResult(null);
    setErrorMessage("");

    setForm({
      budget: "",
      passengers: "",
      startLocation: "",
      endLocation: "",
      preferredVehicle: "",
    });

    setScreen("form");
  };

  return (
    <SafeAreaView style={styles.container}>
      {screen === "home" && (
        <HomeScreen onStart={() => setScreen("form")} />
      )}

      {screen === "form" && (
        <TripInputScreen
          form={form}
          setForm={setForm}
          loading={loading}
          onSubmit={handleSubmit}
          onBack={() => setScreen("home")}
        />
      )}

      {screen === "result" && (
        <ResultScreen
          result={result}
          errorMessage={errorMessage}
          onBack={() => setScreen("form")}
          onNewSearch={handleNewSearch}
        />
      )}

      {loading && (
        <ActivityIndicator
          style={styles.loader}
          color={colors.primary}
          size="large"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  loader: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginLeft: -20,
    marginTop: -20,
  },
});