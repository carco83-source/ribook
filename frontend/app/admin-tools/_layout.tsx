import { Stack } from 'expo-router';

export default function AdminToolsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#1a472a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Stack.Screen name="accounts" options={{ title: 'Gestione Account' }} />
      <Stack.Screen name="payouts" options={{ title: 'Gestione Payout' }} />
    </Stack>
  );
}
