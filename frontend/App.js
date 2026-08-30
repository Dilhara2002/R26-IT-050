import React, { useEffect, useRef, useState } from "react";
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
import ItineraryVehicleScreen from "./screens/ItineraryVehicleScreen";
import MapScreen from "./screens/MapScreen";
import SafetyMapScreen from "./src/screens/SafetyMapScreen";
import TripReviewScreen from "./src/screens/TripReviewScreen";
import LandmarkExplorerScreen from "./src/screens/LandmarkExplorerScreen";
import LandmarkScannerScreen from "./screens/LandmarkScannerScreen";
import LandmarkChatScreen from "./screens/LandmarkChatScreen";
import HotelHomeScreen from "./src/screens/HotelHomeScreen";
import HotelResultsScreen from "./src/screens/HotelResultsScreen";
import AdminPricingScreen from "./src/screens/AdminPricingScreen";
import { adminLogin } from "./src/api/adminApi";

const Stack = createNativeStackNavigator();

function MainFlow({ navigation, route }) {
  const [screen, setScreen] = useState("welcome");
  const [user, setUser] = useState(null);
  const [adminToken, setAdminToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hotelContext, setHotelContext] = useState(null);
  const consumedHotelRequest = useRef(null);
  const [form, setForm] = useState({ budget: "", passengers: "", startLocation: "", endLocation: "", preferredCategory: "" });

  useEffect(() => {
    const request = route.params?.hotelSafetyRequest;
    if (!request || consumedHotelRequest.current === request.id) return;
    const selectedHotel = request.selectedHotel?.hotel || {};
    const hotelName = selectedHotel.name || selectedHotel.hotelName || "";
    const hotelDestination = [hotelName, selectedHotel.district, "Sri Lanka"]
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .join(", ");
    const hotelLatitude = Number(selectedHotel.latitude);
    const hotelLongitude = Number(selectedHotel.longitude);
    const routeDestination =
      Number.isFinite(hotelLatitude) && Number.isFinite(hotelLongitude)
        ? `geo:${hotelLatitude},${hotelLongitude}|${hotelDestination}`
        : hotelDestination;
    consumedHotelRequest.current = request.id;
    setHotelContext(request);
    setResult(null);
    setErrorMessage("");
    setForm({
      budget: "",
      passengers: String(request.vehicleRequest?.passengers || ""),
      startLocation: request.vehicleRequest?.startLocation || "",
      endLocation: routeDestination,
      preferredCategory: request.vehicleRequest?.preferredCategory || "",
    });
    setScreen("form");
  }, [route.params?.hotelSafetyRequest]);

  const handleAuth = async ({ name, email, password }) => {
    if (screen === "adminLogin" || screen === "login") {
      try {
        const admin = await adminLogin(email, password);
        if (admin?.user?.role === "admin") {
          setUser(admin.user);
          setAdminToken(admin.token);
          setScreen("admin");
          return;
        }
      } catch (error) {
        if (screen === "adminLogin") {
          throw new Error(error.response?.data?.message || "Cannot connect to the administrator login service.");
        }
      }
    }
    setUser({ name: name?.trim() || email.split("@")[0], email });
    setScreen("dashboard");
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setResult(null);
      setErrorMessage("");
      const response = await getLowerRiskRoute({
        ...(hotelContext?.vehicleRequest?.estimateVehicleCost
          ? { estimateVehicleCost: true }
          : { budget: Number(form.budget) }),
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
    else if (id === "dunith") navigation.navigate("HotelHome");
    else if (id === "ishan") { setHotelContext(null); setScreen("form"); }
    else if (id === "madush") navigation.navigate("LandmarkScanner");
    else setScreen(`module:${id}`);
  };

  const logout = () => {
    setUser(null);
    setAdminToken(null);
    setScreen("welcome");
  };

  const leaveSafetyForm = () => {
    if (hotelContext) {
      navigation.navigate("HotelResults", {
        packageData: hotelContext.packageData,
        restoredSelection: hotelContext.selectedHotel,
        vehicleRequest: hotelContext.vehicleRequest,
      });
      setHotelContext(null);
      setScreen("dashboard");
      return;
    }
    setScreen("dashboard");
  };

  return (
    <SafeAreaView style={styles.container}>
      {screen === "welcome" && <WelcomeScreen onLogin={() => setScreen("login")} onRegister={() => setScreen("register")} onAdminLogin={() => setScreen("adminLogin")} />}
      {(screen === "login" || screen === "register" || screen === "adminLogin") && <AuthScreen mode={screen} onSubmit={handleAuth} onBack={() => setScreen("welcome")} onSwitch={() => setScreen(screen === "login" ? "register" : "login")} />}
      {screen === "dashboard" && <DashboardScreen user={user} onOpenModule={openModule} onLogout={logout} />}
      {screen === "admin" && <AdminPricingScreen user={user} token={adminToken} onLogout={logout} />}
      {screen.startsWith("module:") && <ModuleScreen moduleId={screen.split(":")[1]} onBack={() => setScreen("dashboard")} />}
      {screen === "form" && <TripInputScreen form={form} setForm={setForm} loading={loading} onSubmit={handleSubmit} onBack={leaveSafetyForm} hotelContext={hotelContext} />}
      {screen === "result" && <SafetyResultScreen result={result} errorMessage={errorMessage} onBack={() => setScreen("form")} onNewSearch={handleNewSearch} onShowMap={(selectedRoute) => navigation.navigate("SafetyMap", { selectedRoute })} onReviewTrip={(selectedVehicle, tripResult) => navigation.navigate("TripReview", { selectedVehicle, tripResult, hotelContext })} />}
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
        <Stack.Screen name="ItineraryVehicle" component={ItineraryVehicleScreen} options={{ title: "Route & Vehicle Match" }} />
        <Stack.Screen name="Map" component={MapScreen} options={{ title: "Itinerary Map" }} />
        <Stack.Screen name="SafetyMap" component={SafetyMapScreen} options={{ title: "Safe Route Map" }} />
        <Stack.Screen name="TripReview" component={TripReviewScreen} options={{ title: "Review Trip Plan" }} />
        <Stack.Screen name="LandmarkExplorer" component={LandmarkExplorerScreen} options={{ title: "Landmark Explorer" }} />
        <Stack.Screen name="LandmarkScanner" component={LandmarkScannerScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LandmarkChat" component={LandmarkChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="HotelHome" component={HotelHomeScreen} options={{ title: "Hotels & Activities" }} />
        <Stack.Screen name="HotelResults" component={HotelResultsScreen} options={{ title: "Your Hotel Matches" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { position: "absolute", top: "50%", left: "50%", marginLeft: -20, marginTop: -20 },
});
