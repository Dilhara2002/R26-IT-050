import React, { useState } from "react";
import { SafeAreaView, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getLowerRiskRoute } from "./src/api/safetyApi";
import { colors } from "./src/styles/colors";
import WelcomeScreen from "./src/screens/WelcomeScreen";
import AuthScreen from "./src/screens/AuthScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import ModuleScreen from "./src/screens/ModuleScreen";
import TripInputScreen from "./src/screens/TripInputScreen";
import SafetyResultScreen from "./src/screens/ResultScreen";
import ItineraryHomeScreen from "./screens/HomeScreen";
import ItineraryResultScreen from "./screens/ResultScreen";
import MapScreen from "./screens/MapScreen";
import SafetyMapScreen from "./src/screens/SafetyMapScreen";
import TripReviewScreen from "./src/screens/TripReviewScreen";
import LandmarkExplorerScreen from "./src/screens/LandmarkExplorerScreen";

const Stack = createNativeStackNavigator();

function MainFlow({ navigation }) {
  const [screen, setScreen] = useState("welcome");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({ budget: "", passengers: "", startLocation: "", endLocation: "", preferredCategory: "" });

  const handleAuth = ({ name, email }) => {
    setUser({ name: name?.trim() || email.split("@")[0], email });
    setScreen("dashboard");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setResult(null);
      setErrorMessage("");
      const response = await getLowerRiskRoute({
        budget: Number(form.budget),
        passengers: Number(form.passengers),
        startLocation: form.startLocation.trim(),
        endLocation: form.endLocation.trim(),
        preferredCategory: form.preferredCategory.trim(),
      });

      if (!response) {
        setErrorMessage("No response received from the backend.");
      } else if (response.success === false || response.error === true) {
        setErrorMessage(response.message || response.error || "Failed to generate recommendation.");
      } else if (!response.routeResult) {
        setErrorMessage("The backend returned an invalid route analysis response.");
      } else {
        setResult(response);
      }
      setScreen("result");
    } catch (error) {
      const message = error?.response?.data?.message || error?.response?.data?.error || error?.message || "Failed to generate recommendation. Please try again.";
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
    setForm({ budget: "", passengers: "", startLocation: "", endLocation: "", preferredCategory: "" });
    setScreen("form");
  };

  const openModule = (id) => {
    if (id === "sasanka") navigation.navigate("ItineraryHome");
    else if (id === "ishan") setScreen("form");
    else if (id === "madush") navigation.navigate("LandmarkExplorer");
    else setScreen(`module:${id}`);
  };

  const logout = () => {
    setUser(null);
    setScreen("welcome");
  };

  return (
    <SafeAreaView style={styles.container}>
      {screen === "welcome" && <WelcomeScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} />}
      {(screen === "login" || screen === "register") && <AuthScreen mode={screen} onSubmit={handleAuth} onBack={() => setScreen("welcome")} onSwitch={() => setScreen(screen === "login" ? "register" : "login")} />}
      {screen === "dashboard" && <DashboardScreen user={user} onOpenModule={openModule} onLogout={logout} />}
      {screen.startsWith("module:") && <ModuleScreen moduleId={screen.split(":")[1]} onBack={() => setScreen("dashboard")} />}
      {screen === "form" && <TripInputScreen form={form} setForm={setForm} loading={loading} onSubmit={handleSubmit} onBack={() => setScreen("dashboard")} />}
      {screen === "result" && <SafetyResultScreen result={result} errorMessage={errorMessage} onBack={() => setScreen("form")} onNewSearch={handleNewSearch} onShowMap={(selectedRoute) => navigation.navigate("SafetyMap", { selectedRoute })} onReviewTrip={(selectedVehicle, tripResult) => navigation.navigate("TripReview", { selectedVehicle, tripResult })} />}
      {loading && <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen name="Main" component={MainFlow} options={{ headerShown: false }} />
        <Stack.Screen name="ItineraryHome" component={ItineraryHomeScreen} options={{ title: "Smart Itinerary" }} />
        <Stack.Screen name="ItineraryResult" component={ItineraryResultScreen} options={{ title: "Optimized Itinerary" }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: "Itinerary Map" }} />
        <Stack.Screen name="SafetyMap" component={SafetyMapScreen} options={{ title: "Safe Route Map" }} />
        <Stack.Screen name="TripReview" component={TripReviewScreen} options={{ title: "Review Trip Plan" }} />
        <Stack.Screen name="LandmarkExplorer" component={LandmarkExplorerScreen} options={{ title: "Landmark Explorer" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { position: "absolute", top: "50%", left: "50%", marginLeft: -20, marginTop: -20 },
});
