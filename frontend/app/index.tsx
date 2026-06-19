import React from 'react';
import { Redirect } from 'expo-router';

export default function WelcomeScreen() {
  // Redirect sempre alla Home - sia loggati che non loggati
  return <Redirect href="/(tabs)" />;
}
