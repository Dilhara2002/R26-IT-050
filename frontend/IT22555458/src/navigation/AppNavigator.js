import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Screens Import කිරීම
import HomeScreen from '../screens/HomeScreen';
import MapDetailsScreen from '../screens/MapDetailsScreen';
import RecommendationScreen from '../screens/RecommendationScreen';
import { COLORS } from '../constants/theme';

const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: COLORS.secondary,
            elevation: 0, // Android shadow ඉවත් කිරීමට
            shadowOpacity: 0, // iOS shadow ඉවත් කිරීමට
          },
          headerTintColor: COLORS.primary,
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          headerTitleAlign: 'center',
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'TOURISM AI' }} 
        />
        <Stack.Screen 
          name="MapDetails" 
          component={MapDetailsScreen} 
          options={{ title: 'ROUTE ANALYSIS' }} 
        />
        <Stack.Screen 
          name="Recommendation" 
          component={RecommendationScreen} 
          options={{ title: 'AI RECOMMENDATION' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;