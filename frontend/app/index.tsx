import React, { useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Breakpoints
const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

export default function WelcomeScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isSmallHeight = height < 700;

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const userId = await AsyncStorage.getItem('user_id');
    if (userId) {
      router.replace('/(tabs)');
    }
  };

  // Stili dinamici
  const dynamicStyles = {
    maxWidth: isDesktop ? 500 : isTablet ? 450 : '100%',
    iconSize: isDesktop ? 90 : isTablet ? 85 : isSmallHeight ? 60 : 80,
    fontSize: {
      title: isDesktop ? 42 : isTablet ? 38 : isSmallHeight ? 30 : 36,
      subtitle: isDesktop ? 18 : isSmallHeight ? 14 : 16,
      feature: isDesktop ? 17 : isSmallHeight ? 14 : 16,
      button: isDesktop ? 19 : 18,
    },
    padding: {
      top: isSmallHeight ? 30 : 60,
      horizontal: isDesktop ? 40 : 24,
    },
    spacing: {
      headerMargin: isSmallHeight ? 20 : 40,
      featuresMargin: isSmallHeight ? 20 : 40,
    },
  };

  return (
    <ScrollView 
      style={styles.scrollView}
      contentContainerStyle={[
        styles.container,
        (isDesktop || isTablet) && styles.containerCentered,
      ]}
    >
      <View style={[
        styles.content,
        { 
          maxWidth: dynamicStyles.maxWidth,
          paddingTop: dynamicStyles.padding.top,
          paddingHorizontal: dynamicStyles.padding.horizontal,
        },
      ]}>
        {/* Header */}
        <View style={[styles.header, { marginBottom: dynamicStyles.spacing.headerMargin }]}>
          <Ionicons name="book" size={dynamicStyles.iconSize} color="#fff" />
          <Text style={[styles.title, { fontSize: dynamicStyles.fontSize.title }]}>
            RiBook
          </Text>
          <Text style={[styles.subtitle, { fontSize: dynamicStyles.fontSize.subtitle }]}>
            Acquisto libro usato assistito
          </Text>
        </View>

        {/* Features Card */}
        <View style={[
          styles.features, 
          { marginBottom: dynamicStyles.spacing.featuresMargin },
          isDesktop && styles.featuresDesktop,
        ]}>
          <View style={styles.featureItem}>
            <Ionicons name="search" size={isSmallHeight ? 26 : 32} color="#1a472a" />
            <Text style={[styles.featureText, { fontSize: dynamicStyles.fontSize.feature }]}>
              Trova i libri che cerchi
            </Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="checkmark-done" size={isSmallHeight ? 26 : 32} color="#1a472a" />
            <Text style={[styles.featureText, { fontSize: dynamicStyles.fontSize.feature }]}>
              Ti selezioniamo i libri da vendere e da acquistare
            </Text>
          </View>
          <View style={[styles.featureItem, { marginBottom: 0 }]}>
            <Ionicons name="calculator" size={isSmallHeight ? 26 : 32} color="#1a472a" />
            <Text style={[styles.featureText, { fontSize: dynamicStyles.fontSize.feature }]}>
              Calcoliamo immediatamente il tuo risparmio
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={[styles.primaryButton, isDesktop && styles.primaryButtonDesktop]}
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={[styles.primaryButtonText, { fontSize: dynamicStyles.fontSize.button }]}>
              Registrati
            </Text>
          </TouchableOpacity>

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                Hai già un account? Accedi
              </Text>
            </Pressable>
          </Link>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Risparmia. Scambia. Studia.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#1a472a',
  },
  container: {
    flexGrow: 1,
    minHeight: '100%',
  },
  containerCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#a8d5ba',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  features: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 40,
  },
  featuresDesktop: {
    padding: 32,
    borderRadius: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  featureText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 16,
    flex: 1,
  },
  buttons: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#f4a460',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDesktop: {
    paddingVertical: 18,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#a8d5ba',
    fontSize: 16,
  },
  footer: {
    color: '#a8d5ba',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
