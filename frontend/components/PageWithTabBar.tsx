import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GlobalTabBar from './GlobalTabBar';

interface PageWithTabBarProps {
  children: React.ReactNode;
  currentTab?: string;
  paddingBottom?: number;
}

/**
 * Wrapper component che aggiunge la TabBar globale in basso a qualsiasi pagina
 * Usare questo per le pagine fuori dal (tabs) folder che devono mostrare la tab bar
 */
export default function PageWithTabBar({ children, currentTab, paddingBottom = 0 }: PageWithTabBarProps) {
  const insets = useSafeAreaInsets();
  
  const getTabBarHeight = () => {
    if (Platform.OS === 'ios') return 88;
    if (Platform.OS === 'android') return Math.max(80, 60 + insets.bottom);
    return 70;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.content, { paddingBottom: getTabBarHeight() + paddingBottom }]}>
        {children}
      </View>
      <GlobalTabBar currentTab={currentTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
});
