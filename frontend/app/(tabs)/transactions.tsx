import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// Questa pagina è deprecata - redirect a my-exchanges
export default function TransactionsScreen() {
  const router = useRouter();

  useEffect(() => {
    // Redirect alla nuova pagina
    router.replace('/profile/my-exchanges');
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
