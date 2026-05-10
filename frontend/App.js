import React, { useState } from "react";
import { SafeAreaView, ActivityIndicator, StyleSheet, Alert } from "react-native";

import { getVehicleRecommendation } from "./src/api/safetyApi";
import { colors } from "./src/styles/colors";

import HomeScreen from "./src/screens/HomeScreen";
import TripInputScreen from "./src/screens/TripInputScreen";
import ResultScreen from "./src/screens/ResultScreen";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

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
      setResult(null);

      const response = await getVehicleRecommendation({
        budget: Number(form.budget),
        passengers: Number(form.passengers),
        startLocation: form.startLocation,
        endLocation: form.endLocation,
        preferredVehicle: form.preferredVehicle,
        isRaining: form.isRaining,
      });

      setResult(response);
      setScreen("result");
    } catch (error) {
      console.log(error);
      Alert.alert("Error", "Failed to fetch recommendation");
    } finally {
      setLoading(false);
    }
  };

  const handleNewSearch = () => {
    setResult(null);
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
          onBack={() => setScreen("form")}
          onNewSearch={handleNewSearch}
        />
      )}

      {loading && <ActivityIndicator style={styles.loader} color={colors.primary} />}
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
  },
});