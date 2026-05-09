import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import TourismHomeScreen from "../screens/TourismHomeScreen";
import TourismResultScreen from "../screens/TourismResultScreen";
import tourismColors from "../theme/tourismColors";

const Stack = createStackNavigator();

export default function TourismNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: tourismColors.primary,
          },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: {
            fontWeight: "800",
          },
          cardStyle: {
            backgroundColor: tourismColors.background,
          },
        }}
      >
        <Stack.Screen
          name="TourismHome"
          component={TourismHomeScreen}
          options={{ title: "AI Tourism Planner" }}
        />

        <Stack.Screen
          name="TourismResults"
          component={TourismResultScreen}
          options={{ title: "Generated Package" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}