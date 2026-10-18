import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SafeAreaView, ActivityIndicator, StyleSheet, Alert, Platform, Text, Button } from "react-native";
import { NavigationContainer, getPathFromState, getStateFromPath } from "@react-navigation/native";
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
import LocationPickerScreen from "./src/screens/LocationPickerScreen";
import { adminLogin } from "./src/api/adminApi";
import { restoreSession, travellerAuth, endSession } from "./src/api/authApi";
import { screenPaths, mainPage, readNavigation, saveNavigation, clearNavigation, navigationForUrl, navigationForLink, hasRequiredRouteData } from "./services/sessionNavigation";
import MobileBackButton from "./src/components/MobileBackButton";

const Stack = createNativeStackNavigator();
const SessionContext = createContext(null);
const browserStorage = () => {
  try { return Platform.OS === "web" ? globalThis.sessionStorage : null; } catch { return null; }
};

function withRouteData(Screen) {
  return function RestoredRoute(props) {
    if (!hasRequiredRouteData(props.route.name, props.route.params)) return (
      <SafeAreaView style={styles.container}>
        <Text>Trip details are unavailable in this browser tab. Open a plan to continue.</Text>
        <Button title="Open dashboard" onPress={() => props.navigation.navigate("Main", { page: "dashboard" })} />
      </SafeAreaView>
    );
    return <Screen {...props} />;
  };
}
const RestoredItineraryResult = withRouteData(ItineraryResultScreen);
const RestoredItineraryVehicle = withRouteData(ItineraryVehicleScreen);
const RestoredMap = withRouteData(MapScreen);
const RestoredSafetyMap = withRouteData(SafetyMapScreen);
const RestoredTripReview = withRouteData(TripReviewScreen);

function MainFlow({ navigation, route }) {
  const { session, acceptSession, logout, savedFlow, persistFlow } = useContext(SessionContext);
  const user = session?.user;
  const [publicScreen, setPublicScreen] = useState(globalThis.location?.pathname && globalThis.location.pathname !== "/" ? "login" : "welcome");
  const screen = user ? mainPage(route.params?.page || savedFlow?.screen, user.role) : publicScreen;
  const setScreen = useCallback(value => user ? navigation.setParams({ page: value }) : setPublicScreen(value), [user, navigation]);
  useEffect(() => {
    if (user && route.params?.page !== screen) navigation.setParams({ page: screen });
  }, [user, screen, route.params?.page, navigation]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(savedFlow?.result || null);
  const [errorMessage, setErrorMessage] = useState("");
  const [hotelContext, setHotelContext] = useState(savedFlow?.hotelContext || null);
  const consumedHotelRequest = useRef(null);
  const consumedLocationSelection = useRef(null);
  const [form, setForm] = useState(savedFlow?.form || { budget: "", passengers: "", startLocation: "", endLocation: "", preferredCategory: "" });

  useEffect(() => {
    if (user) persistFlow({ screen, form, result, hotelContext });
  }, [user, screen, form, result, hotelContext, persistFlow]);

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
  }, [route.params?.hotelSafetyRequest, setScreen]);

  useEffect(() => {
    const selection = route.params?.locationSelection;
    if (!selection || consumedLocationSelection.current === selection.id) return;
    if (selection.field !== "startLocation" && selection.field !== "endLocation") return;
    consumedLocationSelection.current = selection.id;
    setHotelContext(null);
    setForm((current) => ({ ...current, [selection.field]: selection.value }));
    setScreen("form");
  }, [route.params?.locationSelection, setScreen]);

  const handleAuth = async ({ name, email, password, register }) => {
    try {
      const authenticated = screen === "adminLogin"
        ? await adminLogin(email, password)
        : await travellerAuth({ name, email, password, register });
      if (!authenticated?.user || (screen === "adminLogin" && authenticated.user.role !== "admin")) {
        throw new Error("Authentication failed.");
      }
      acceptSession(authenticated);
    } catch (error) {
      throw new Error(error.response?.data?.message || error.message || "Unable to sign in.");
    }
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
      {screen === "admin" && <AdminPricingScreen user={user} token={null} onLogout={logout} />}
      {screen.startsWith("module:") && <ModuleScreen moduleId={screen.split(":")[1]} onBack={() => setScreen("dashboard")} />}
      {screen === "form" && <TripInputScreen form={form} setForm={setForm} loading={loading} onSubmit={handleSubmit} onBack={leaveSafetyForm} hotelContext={hotelContext} onPickLocation={(field) => navigation.navigate("LocationPicker", { field })} />}
      {screen === "result" && <SafetyResultScreen result={result} errorMessage={errorMessage} onBack={() => setScreen("form")} onNewSearch={handleNewSearch} onShowMap={(selectedRoute) => navigation.navigate("SafetyMap", { selectedRoute })} onReviewTrip={(selectedVehicle, tripResult) => navigation.navigate("TripReview", { selectedVehicle, tripResult, hotelContext })} />}
      {loading && <ActivityIndicator style={styles.loader} color={colors.primary} size="large" />}
    </SafeAreaView>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const snapshot = useRef(null);
  const navigationRef = useRef(null);
  const sessionRef = useRef(null);
  const acceptSession = useCallback(value => {
    const previous = sessionRef.current?.user?.id;
    if (previous && previous !== value?.user?.id) clearNavigation(browserStorage(), previous);
    if (previous !== value?.user?.id) snapshot.current = value ? readNavigation(browserStorage(), value.user.id) : null;
    sessionRef.current = value;
    setSession(value);
  }, []);
  const checkSession = useCallback(async () => {
    try {
      acceptSession(await restoreSession());
      setSessionError(false);
    } catch {
      setSessionError(true);
    } finally { setChecking(false); }
  }, [acceptSession]);
  useEffect(() => { checkSession(); }, [checkSession]);
  useEffect(() => {
    if (!session) return undefined;
    const remaining = Date.parse(session.expiresAt) - Date.now();
    const timer = setTimeout(() => acceptSession(null), Math.max(0, remaining));
    if (Platform.OS === "web") globalThis.addEventListener?.("focus", checkSession);
    return () => {
      clearTimeout(timer);
      if (Platform.OS === "web") globalThis.removeEventListener?.("focus", checkSession);
    };
  }, [session, acceptSession, checkSession]);
  const persistNavigation = useCallback(state => {
    if (!sessionRef.current || !state) return;
    snapshot.current = { ...snapshot.current, navigation: state, path: getPathFromState(navigationForLink(state), { screens: screenPaths }) };
    saveNavigation(browserStorage(), sessionRef.current.user.id, snapshot.current);
  }, []);
  const persistFlow = useCallback(flow => {
    snapshot.current = { ...snapshot.current, flow };
    saveNavigation(browserStorage(), sessionRef.current?.user?.id, snapshot.current);
  }, []);
  const logout = async () => {
    try {
      await endSession();
      clearNavigation(browserStorage(), session?.user?.id);
      snapshot.current = null;
      acceptSession(null);
    } catch { Alert.alert("Logout unavailable", "Unable to end the server session. Please retry."); }
  };
  if (checking) return <SafeAreaView style={styles.container}><ActivityIndicator accessibilityLabel="Restoring session" /></SafeAreaView>;
  if (sessionError) return <SafeAreaView style={styles.container}><Text>Unable to verify your session. Check the API connection.</Text><Button title="Retry" onPress={checkSession} /></SafeAreaView>;
  const linking = session ? {
    prefixes: [], config: { screens: screenPaths },
    getPathFromState: (state, options) => getPathFromState(navigationForLink(state), options),
    getStateFromPath: (path, options) => {
      const state = getStateFromPath(path, options);
      if (state) state.routes = state.routes.map(item => ({ ...item, params: {
        ...snapshot.current?.navigation?.routes?.find(old => old.name === item.name)?.params,
        ...(item.name === "Main" ? { page: item.params?.page } : {}),
      } }));
      return state;
    },
  } : undefined;
  return (
    <SessionContext.Provider value={{ session, acceptSession, logout, savedFlow: snapshot.current?.flow, persistFlow }}>
    <NavigationContainer key={session?.user?.id || "anonymous"} ref={navigationRef} linking={linking}
      initialState={session && Platform.OS === "web" ? navigationForUrl(snapshot.current, globalThis.location?.pathname) : undefined}
      onReady={() => persistNavigation(navigationRef.current?.getRootState())} onStateChange={persistNavigation}>
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.primaryDark },
          headerTintColor: colors.background,
          headerTitleStyle: { color: colors.background, fontWeight: "700" },
          headerShadowVisible: false,
          headerBackVisible: false,
          headerLeft: ({ canGoBack }) => canGoBack ? (
            <MobileBackButton
              onPress={() => navigation.goBack()}
              onDark
              style={{ marginRight: 10 }}
            />
          ) : null,
          contentStyle: { backgroundColor: colors.background },
        })}
      >
        <Stack.Screen name="Main" component={MainFlow} options={{ headerShown: false }} />
        {session && <>
        <Stack.Screen name="ItineraryHome" component={ItineraryHomeScreen} options={{ title: "Smart Itinerary" }} />
        <Stack.Screen name="ItineraryResult" component={RestoredItineraryResult} options={{ title: "Optimized Itinerary" }} />
        <Stack.Screen name="ItineraryVehicle" component={RestoredItineraryVehicle} options={{ title: "Route & Vehicle Match" }} />
        <Stack.Screen name="Map" component={RestoredMap} options={{ title: "Itinerary Map" }} />
        <Stack.Screen name="SafetyMap" component={RestoredSafetyMap} options={{ title: "Safe Route Map" }} />
        <Stack.Screen name="TripReview" component={RestoredTripReview} options={{ title: "Review Trip Plan" }} />
        <Stack.Screen name="LandmarkExplorer" component={LandmarkExplorerScreen} options={{ title: "Landmark Explorer" }} />
        <Stack.Screen name="LandmarkScanner" component={LandmarkScannerScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LandmarkChat" component={LandmarkChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="HotelHome" component={HotelHomeScreen} options={{ title: "Hotels & Activities" }} />
        <Stack.Screen name="HotelResults" component={HotelResultsScreen} options={{ title: "Your Hotel Matches" }} />
        <Stack.Screen name="LocationPicker" component={LocationPickerScreen} options={{ headerShown: false }} />
        </>}
      </Stack.Navigator>
    </NavigationContainer>
    </SessionContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loader: { position: "absolute", top: "50%", left: "50%", marginLeft: -20, marginTop: -20 },
});
