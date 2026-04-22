import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/constants/theme';

/**
 * AI-Powered Tourism Platform - Individual Component
 * Student ID: IT22555458
 * Task: Intelligent Vehicle Selection & Route Optimization
 */

export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={COLORS.secondary || '#1A1A1A'} 
        translucent={false}
      />
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