import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface FooterProps {
  showCompanyInfo?: boolean;
}

export default function Footer({ showCompanyInfo = true }: FooterProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const handleLinkPress = (route: string) => {
    router.push(route as any);
  };

  const handleEmailPress = () => {
    Linking.openURL('mailto:nica.cartolibreria@gmail.com');
  };

  const handlePecPress = () => {
    Linking.openURL('mailto:carto.nica@pec.it');
  };

  return (
    <View style={[styles.container, isDesktop && styles.containerDesktop]}>
      {/* Link Legali */}
      <View style={[styles.linksRow, isDesktop && styles.linksRowDesktop]}>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => handleLinkPress('/termini-condizioni')}
        >
          <Text style={styles.linkText}>Termini e Condizioni</Text>
        </TouchableOpacity>
        
        <Text style={styles.separator}>|</Text>
        
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => handleLinkPress('/privacy-policy')}
        >
          <Text style={styles.linkText}>Privacy Policy</Text>
        </TouchableOpacity>
        
        <Text style={styles.separator}>|</Text>
        
        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => handleLinkPress('/cookie-policy')}
        >
          <Text style={styles.linkText}>Cookie Policy</Text>
        </TouchableOpacity>
      </View>

      {/* Info Aziendali */}
      {showCompanyInfo && (
        <View style={styles.companyInfo}>
          <Text style={styles.companyName}>Ni.Ca. s.a.s.</Text>
          <Text style={styles.companyDetail}>Viale Magna Grecia n.179, 88100 Catanzaro (CZ)</Text>
          <Text style={styles.companyDetail}>P. IVA 01696960796</Text>
          
          <View style={[styles.contactRow, isDesktop && styles.contactRowDesktop]}>
            <TouchableOpacity style={styles.contactButton} onPress={handleEmailPress}>
              <Ionicons name="mail-outline" size={14} color="#666" />
              <Text style={styles.contactText}>nica.cartolibreria@gmail.com</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.contactButton} onPress={handlePecPress}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#666" />
              <Text style={styles.contactText}>carto.nica@pec.it</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Copyright */}
      <Text style={styles.copyright}>
        © {new Date().getFullYear()} RiBook - Tutti i diritti riservati
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  containerDesktop: {
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  linksRowDesktop: {
    marginBottom: 20,
  },
  linkButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#1a472a',
    fontWeight: '500',
  },
  separator: {
    color: '#ccc',
    fontSize: 13,
  },
  companyInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  companyName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  contactRow: {
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  contactRowDesktop: {
    flexDirection: 'row',
    gap: 20,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 12,
    color: '#666',
  },
  copyright: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
});
