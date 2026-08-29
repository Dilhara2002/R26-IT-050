import React, { useState } from "react";

import {
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  Alert,
  View,
  Text,
  Pressable,
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
import LandmarkScannerScreen from "./screens/LandmarkScannerScreen";

const Stack = createNativeStackNavigator();


function ComponentLauncher({ navigation }) {
  return (
    <SafeAreaView style={styles.launcherContainer}>
      <View style={styles.launcherCard}>
        <Text style={styles.launcherTitle}>Tourism Research Platform</Text>
        <Text style={styles.launcherSubtitle}>Choose a component to test.</Text>

        <Pressable
          onPress={() => navigation.navigate("Safety")}
          style={({ pressed }) => [styles.launcherButton, pressed && styles.launcherButtonPressed]}
        >
          <Text style={styles.launcherButtonTitle}>Safety Analyzer</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("ItineraryHome")}
          style={({ pressed }) => [styles.launcherButton, pressed && styles.launcherButtonPressed]}
        >
          <Text style={styles.launcherButtonTitle}>Itinerary Optimizer</Text>
          <Text style={styles.launcherButtonText}>Context-aware, time-constrained route planning</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}



function SafetyFlow() {


  const [screen, setScreen] = useState("home");

  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);

  const [errorMessage, setErrorMessage] = useState("");


  const [form, setForm] = useState({

    budget: "",
    passengers: "",

    startLocation: "",
    endLocation: "",

    preferredCategory: "",

  });



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
          onStart={() => setScreen("form")}
          onOpenLandmark={() => setScreen("landmark")}
        />
      )}

      {screen === "landmark" && (
        <LandmarkScannerScreen
          onBack={() => setScreen("home")}
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
          options={{ headerShown: false }}
        />


        <Stack.Screen

          name="Safety"

          component={SafetyFlow}

          options={{
            headerShown:false
          }}

        />


        <Stack.Screen
          name="ItineraryHome"
          component={ItineraryHomeScreen}
          options={{ title: "Itinerary Optimizer" }}
        />

        <Stack.Screen
          name="ItineraryResult"
          component={ItineraryResultScreen}
          options={{ title: "Optimized Itinerary" }}
        />


        <Stack.Screen
          name="Map"
          component={MapScreen}
        />

        <Stack.Screen
          name="LandmarkScanner"
          component={LandmarkScannerScreen}
          options={{
            title: "Landmark Scanner",
            headerStyle: { backgroundColor: "#1D4ED8" },
            headerTintColor: "#FFFFFF",
          }}
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
    borderRadius: 24,
    padding: 24,
    elevation: 6,
  },

  launcherTitle: {
    color: "#0F172A",
    fontSize: 28,
    fontWeight: "900",
  },

  launcherSubtitle: {
    color: "#64748B",
    fontSize: 16,
    marginTop: 6,
    marginBottom: 18,
  },

  launcherButton: {
    backgroundColor: "#2563EB",
    borderRadius: 16,
    padding: 18,
    marginTop: 12,
  },

  launcherButtonPressed: {
    opacity: 0.75,
  },

  launcherButtonTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },

  launcherButtonText: {
    color: "#DBEAFE",
    marginTop: 4,
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
