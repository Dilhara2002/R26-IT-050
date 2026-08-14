import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { TripDraftProvider } from "../src/state/TripDraftContext";

export default function RootLayout() {
  return (
    <TripDraftProvider>
      <Stack screenOptions={{ headerBackTitle: "Back", headerTintColor: "#1d4ed8" }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="plan/index" options={{ title: "Plan a trip" }} />
        <Stack.Screen name="plan/recommendations" options={{ title: "Recommendations" }} />
        <Stack.Screen name="plan/itinerary" options={{ title: "Itinerary" }} />
        <Stack.Screen name="plan/safety" options={{ title: "Route safety" }} />
        <Stack.Screen name="plan/summary" options={{ title: "Your trip plan" }} />
        <Stack.Screen name="trips" options={{ title: "Trips" }} />
        <Stack.Screen name="profile" options={{ title: "Profile" }} />
      </Stack>
      <StatusBar style="auto" />
    </TripDraftProvider>
  );
}
