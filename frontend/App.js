import React, { useEffect, useState } from "react";

import {
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  View,
  Text,
  Pressable,
  ScrollView,
} from "react-native";

import {
  NavigationContainer,
} from "@react-navigation/native";

import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";


import {
  getVehicleRecommendation,
} from "./src/api/safetyApi";

import {
  colors,
} from "./src/styles/colors";


import HomeScreen from "./src/screens/HomeScreen";
import TripInputScreen from "./src/screens/TripInputScreen";
import ResultScreen from "./src/screens/ResultScreen";
import ItineraryHomeScreen from "./screens/HomeScreen";
import ItineraryResultScreen from "./screens/ResultScreen";
import MapScreen from "./screens/MapScreen";
import TripSafetyAnalysis from "./components/TripSafetyAnalysis";
import { recommendItinerarySafety } from "./services/safetyApi";


const Stack = createNativeStackNavigator();



function ComponentLauncher({ navigation }) {
  return (
    <SafeAreaView style={styles.launcherContainer}>
      <View style={styles.launcherCard}>
        <Text style={styles.launcherTitle}>Tourism Research Platform</Text>
        <Text style={styles.launcherSubtitle}>
          Choose the research component you want to test.
        </Text>

        <Pressable
          onPress={() => navigation.navigate("Safety", { itinerarySafetyRequest: null })}
          style={({ pressed }) => [
            styles.launcherButton,
            pressed && styles.launcherButtonPressed,
          ]}
        >
          <Text style={styles.launcherButtonTitle}>Safety Analyzer</Text>
          <Text style={styles.launcherButtonText}>
            Vehicle recommendations with route-risk analysis
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("ItineraryHome")}
          style={({ pressed }) => [
            styles.launcherButton,
            pressed && styles.launcherButtonPressed,
          ]}
        >
          <Text style={styles.launcherButtonTitle}>Itinerary Optimizer</Text>
          <Text style={styles.launcherButtonText}>
            Context-aware, time-constrained route planning
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}



function SafetyFlow({ route }) {


  const [screen, setScreen] = useState("home");

  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [itineraryResult, setItineraryResult] = useState(null);
  const [itineraryError, setItineraryError] = useState("");
  const [itineraryValidationError, setItineraryValidationError] = useState("");
  const [itineraryBudget, setItineraryBudget] = useState("");
  const [itineraryPassengers, setItineraryPassengers] = useState("");
  const [itineraryCategory, setItineraryCategory] = useState("");
  const itineraryRequest = route.params?.itinerarySafetyRequest || null;


  const [form, setForm] = useState({

    budget: "",
    passengers: "",

    startLocation: "",
    endLocation: "",

    preferredCategory: "",

  });

  useEffect(() => {
    if (!itineraryRequest) return undefined;
    let active = true;
    setLoading(true);
    setItineraryResult(null);
    setItineraryError("");
    recommendItinerarySafety(itineraryRequest)
      .then((response) => {
        if (active) setItineraryResult(response);
      })
      .catch((error) => {
        if (!active) return;
        if (error?.safetyResponse) setItineraryResult(error.safetyResponse);
        setItineraryError(error?.message || "Trip safety analysis could not be completed.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [itineraryRequest]);

  const handleItineraryAnalyze = async () => {
    if (loading) return;
    const budget = Number(itineraryBudget.trim());
    const passengers = Number(itineraryPassengers.trim());
    if (!itineraryBudget.trim() || !Number.isFinite(budget) || budget <= 0) {
      setItineraryValidationError("Enter a whole-trip budget greater than 0 LKR.");
      return;
    }
    if (!itineraryPassengers.trim() || !Number.isInteger(passengers) || passengers <= 0) {
      setItineraryValidationError("Enter passengers as a positive whole number.");
      return;
    }
    setLoading(true);
    setItineraryValidationError("");
    setItineraryError("");
    try {
      const response = await recommendItinerarySafety({
        ...itineraryRequest,
        budget,
        passengers,
        ...(itineraryCategory.trim() ? { preferredCategory: itineraryCategory.trim() } : {}),
      });
      setItineraryResult(response);
    } catch (error) {
      if (error?.safetyResponse) setItineraryResult(error.safetyResponse);
      setItineraryError(error?.message || "Trip safety analysis could not be completed.");
    } finally {
      setLoading(false);
    }
  };

  if (itineraryRequest) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <TripSafetyAnalysis
            budget={itineraryBudget}
            passengers={itineraryPassengers}
            preferredCategory={itineraryCategory}
            onBudgetChange={setItineraryBudget}
            onPassengersChange={setItineraryPassengers}
            onPreferredCategoryChange={setItineraryCategory}
            onAnalyze={handleItineraryAnalyze}
            loading={loading}
            availabilityMessage=""
            validationError={itineraryValidationError}
            requestError={itineraryError}
            result={itineraryResult}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }



  const handleSubmit = async () => {


    try {

      setLoading(true);

      setResult(null);

      setErrorMessage("");



      const response =
        await getVehicleRecommendation({

          budget: Number(form.budget),

          passengers: Number(form.passengers),

          startLocation:
            form.startLocation.trim(),

          endLocation:
            form.endLocation.trim(),

          preferredCategory:
            form.preferredCategory.trim(),

        });



      if (!response) {

        setErrorMessage(
          "No response received from backend."
        );

        setScreen("result");

        return;

      }



      if (
        response.success === false ||
        response.error === true
      ) {

        setErrorMessage(
          response.message ||
          "Recommendation failed."
        );

        setScreen("result");

        return;

      }



      if (!response.riskPrediction) {

        setErrorMessage(
          "Invalid backend response."
        );

        setScreen("result");

        return;

      }



      setResult(response);

      setScreen("result");



    } catch(error) {


      const message =
        error?.message ||
        "Something went wrong";


      setErrorMessage(message);


      Alert.alert(
        "Recommendation Error",
        message
      );


    } finally {

      setLoading(false);

    }

  };



  return (

    <SafeAreaView style={styles.container}>


      {screen === "home" && (

        <HomeScreen
          onStart={() =>
            setScreen("form")
          }
        />

      )}



      {screen === "form" && (

        <TripInputScreen

          form={form}

          setForm={setForm}

          loading={loading}

          onSubmit={handleSubmit}

          onBack={() =>
            setScreen("home")
          }

        />

      )}



      {screen === "result" && (

        <ResultScreen

          result={result}

          errorMessage={errorMessage}

          onBack={() =>
            setScreen("form")
          }

          onNewSearch={() =>
            setScreen("home")
          }

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




export default function App() {


  return (

    <NavigationContainer>


      <Stack.Navigator initialRouteName="ComponentLauncher">


        <Stack.Screen
          name="ComponentLauncher"
          component={ComponentLauncher}
          options={{
            headerShown: false
          }}
        />


        <Stack.Screen

          name="Safety"

          component={SafetyFlow}

          options={{
            title: "Safety Analyzer"
          }}

        />


        <Stack.Screen
          name="ItineraryHome"
          component={ItineraryHomeScreen}
          options={{
            title: "Itinerary Optimizer"
          }}
        />


        <Stack.Screen
          name="ItineraryResult"
          component={ItineraryResultScreen}
          options={{
            title: "Optimized Itinerary"
          }}
        />


        <Stack.Screen

          name="Map"

          component={MapScreen}

        />


      </Stack.Navigator>


    </NavigationContainer>

  );

}



const styles = StyleSheet.create({

  launcherContainer: {
    flex: 1,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },


  launcherCard: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    elevation: 6,
  },


  launcherTitle: {
    color: "#0F172A",
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 8,
  },


  launcherSubtitle: {
    color: "#64748B",
    fontSize: 16,
    marginBottom: 24,
  },


  launcherButton: {
    backgroundColor: "#2563EB",
    borderRadius: 18,
    padding: 20,
    marginTop: 12,
  },


  launcherButtonPressed: {
    opacity: 0.75,
  },


  launcherButtonTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 5,
  },


  launcherButtonText: {
    color: "#DBEAFE",
    lineHeight: 20,
  },

  container: {

    flex:1,

    backgroundColor:
      colors.background,

  },


  loader: {

    position:"absolute",

    top:"50%",

    left:"50%",

    marginLeft:-20,

    marginTop:-20,

  },


});
