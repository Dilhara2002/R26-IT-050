import 'react-native-gesture-handler'; // මෙය අනිවාර්යයෙන්ම පළමු පේළිය විය යුතුය
import React from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/constants/theme';

/**
 * AI-Powered Tourism Platform - Individual Component
 * Student ID: IT22555458
 * Individual Task: Intelligent Vehicle Selection & Route Optimization
 */

export default function App() {
  return (
    // මුළු App එකම GestureHandlerRootView එකෙන් වට කළ යුත්තේ Navigation සහ Swipe gestures වැඩ කිරීමටයි
    <GestureHandlerRootView style={styles.container}>
      {/* ඇප් එකේ ඉහළ StatusBar එක Luxury Dark තේමාවට අනුකූල කිරීම */}
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={COLORS.secondary || '#1A1A1A'} 
        translucent={false}
      />
      
      {/* සියලුම Screen මාරුවීම් පාලනය කරන්නේ AppNavigator හරහායි */}
      <AppNavigator />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.secondary || '#1A1A1A',
  },
});