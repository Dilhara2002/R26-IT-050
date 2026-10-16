import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { NavigationContainer } from '@react-navigation/native';
import PreferenceScreen from '../screens/PreferenceScreen';
import DashboardScreen from '../screens/DashboardScreen';
import { COLORS } from '../constants/theme';

const Stack = createStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.secondary, elevation: 0, shadowOpacity: 0 },
          headerTintColor: COLORS.primary,
          headerTitleStyle: { fontWeight: 'bold' },
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen name="Setup" component={PreferenceScreen} options={{ title: 'AI TOURISM PLANNER' }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'OPTIMIZED MAP' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}