import React, { useState } from "react";

import {
  SafeAreaView,
  ActivityIndicator,
  StyleSheet,
  Alert,
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
import MapScreen from "./screens/MapScreen";
import LandmarkScannerScreen from "./screens/LandmarkScannerScreen";
import LandmarkChatScreen from "./screens/LandmarkChatScreen";

const Stack = createNativeStackNavigator();



function SafetyFlow() {
  const [screen, setScreen] = useState("home");
  const [chatContext, setChatContext] = useState(null);
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

      const response = await getVehicleRecommendation({
        budget: Number(form.budget),
        passengers: Number(form.passengers),
        startLocation: form.startLocation.trim(),
        endLocation: form.endLocation.trim(),
        preferredCategory: form.preferredCategory.trim(),
      });

      if (!response) {
        setErrorMessage("No response received from backend.");
        setScreen("result");
        return;
      }

      if (response.success === false || response.error === true) {
        setErrorMessage(response.message || "Recommendation failed.");
        setScreen("result");
        return;
      }

      if (!response.riskPrediction) {
        setErrorMessage("Invalid backend response.");
        setScreen("result");
        return;
      }

      setResult(response);
      setScreen("result");
    } catch(error) {
      const message = error?.message || "Something went wrong";
      setErrorMessage(message);
      Alert.alert("Recommendation Error", message);
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
          onOpenChat={(context) => {
            setChatContext(context);
            setScreen("chat");
          }}
        />
      )}

      {screen === "chat" && (
        <LandmarkChatScreen
          landmarkContext={chatContext}
          onBack={() => setScreen("landmark")}
        />
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
          onNewSearch={() => setScreen("home")}
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
      <Stack.Navigator>
        <Stack.Screen
          name="Safety"
          component={SafetyFlow}
          options={{
            headerShown: false,
          }}
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

        <Stack.Screen
          name="LandmarkChat"
          component={LandmarkChatScreen}
          options={{
            title: "AI Tour Guide",
            headerStyle: { backgroundColor: "#1D4ED8" },
            headerTintColor: "#FFFFFF",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}



const styles = StyleSheet.create({

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