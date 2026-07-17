import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SECTIONS = [
  {
    title: '1. TITOLARE DEL TRATTAMENTO',
    content: `Ni.Ca. s.a.s.
Viale Magna Grecia n.179, 88100 Catanzaro (CZ)
P. IVA 01696960796
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it`
  },
  {
    title: '2. COSA SONO I COOKIE',
    content: `I cookie sono piccoli file di testo che vengono salvati sul dispositivo dell'utente durante la navigazione.
Essi consentono al sito di funzionare correttamente, migliorare l'esperienza dell'utente, mantenere attiva la sessione di autenticazione, ricordare alcune preferenze e raccogliere informazioni statistiche sul funzionamento della piattaforma.
I cookie non permettono normalmente l'identificazione diretta dell'utente, ma possono essere associati ad informazioni già in possesso del Titolare o dei fornitori dei servizi utilizzati.`
  },
  {
    title: '3. TIPOLOGIE DI COOKIE UTILIZZATE',
    content: `RiBook utilizza esclusivamente le categorie di cookie indicate nella presente informativa.
Le categorie potranno essere aggiornate nel tempo qualora vengano introdotte nuove funzionalità.`
  },
  {
    title: '4. COOKIE TECNICI',
    content: `I cookie tecnici sono indispensabili per il corretto funzionamento della piattaforma.
Essi consentono, tra l'altro, di:
• effettuare il login;
• mantenere attiva la sessione;
• garantire la sicurezza dell'account;
• ricordare alcune preferenze dell'utente;
• consentire la navigazione tra le varie sezioni della piattaforma;
• garantire il corretto funzionamento del carrello e delle operazioni di compravendita.
L'utilizzo di tali cookie non richiede il consenso dell'utente.`
  },
  {
    title: '5. COOKIE DI AUTENTICAZIONE',
    content: `RiBook consente l'accesso tramite:
• registrazione con indirizzo e-mail;
• autenticazione mediante account Google.
Durante tali operazioni vengono utilizzati cookie necessari al riconoscimento dell'utente e alla gestione della sessione autenticata.
Tali cookie sono indispensabili per consentire il corretto utilizzo dei servizi offerti dalla piattaforma.`
  },
  {
    title: '6. COOKIE DI SICUREZZA',
    content: `Per proteggere gli utenti da accessi non autorizzati, utilizzi fraudolenti e tentativi di compromissione degli account, RiBook utilizza cookie e strumenti tecnici destinati esclusivamente alla sicurezza della piattaforma.
Tali cookie consentono di verificare l'identità dell'utente e garantire la sicurezza delle operazioni effettuate.`
  },
  {
    title: '7. COOKIE STATISTICI',
    content: `RiBook utilizza Google Analytics per raccogliere informazioni statistiche aggregate e anonime sull'utilizzo della piattaforma.
Le informazioni possono riguardare, a titolo esemplificativo:
• numero di visitatori;
• pagine visualizzate;
• tempo medio di permanenza;
• dispositivo utilizzato;
• sistema operativo;
• browser utilizzato;
• provenienza geografica approssimativa.
Le informazioni raccolte vengono utilizzate esclusivamente per migliorare i servizi offerti.`
  },
  {
    title: '8. COOKIE RELATIVI AI PAGAMENTI',
    content: `I pagamenti presenti sulla piattaforma vengono elaborati tramite Stripe.
Durante la procedura di pagamento Stripe può utilizzare cookie tecnici necessari al corretto funzionamento del servizio, alla prevenzione delle frodi e alla sicurezza delle transazioni.
RiBook non memorizza né tratta direttamente i dati completi delle carte di pagamento degli utenti.`
  },
  {
    title: '9. LOCAL STORAGE E SESSION STORAGE',
    content: `Oltre ai cookie, RiBook utilizza tecnologie di memorizzazione locale del browser quali:
• Local Storage;
• Session Storage.
Tali strumenti vengono utilizzati esclusivamente per garantire il corretto funzionamento della piattaforma e migliorare l'esperienza dell'utente.
Le informazioni memorizzate possono riguardare: stato della sessione, preferenze dell'utente, configurazioni temporanee, dati necessari al funzionamento dell'applicazione.`
  },
  {
    title: '10. SERVICE WORKER',
    content: `RiBook utilizza un Service Worker per migliorare le prestazioni della piattaforma.
Il Service Worker può essere utilizzato per:
• migliorare la velocità di caricamento delle pagine;
• gestire la cache del browser;
• aumentare l'affidabilità della navigazione;
• ottimizzare l'utilizzo della piattaforma come Web App.`
  },
  {
    title: '11. COOKIE DI TERZE PARTI',
    content: `Nel funzionamento della piattaforma possono essere utilizzati servizi forniti da soggetti terzi.
Tra essi rientrano, a titolo esemplificativo:
• Google;
• Google Identity Services;
• Google Analytics;
• Stripe.
L'utilizzo dei relativi cookie è disciplinato anche dalle informative privacy dei rispettivi fornitori.`
  },
  {
    title: '12. BASE GIURIDICA',
    content: `L'utilizzo dei cookie tecnici trova fondamento nell'articolo 6, paragrafo 1, lettere b) ed f) del Regolamento (UE) 2016/679.
Per eventuali cookie statistici soggetti a consenso, il trattamento viene effettuato esclusivamente previo consenso dell'utente, ove richiesto dalla normativa vigente.`
  },
  {
    title: '13. DURATA DEI COOKIE',
    content: `I cookie possono essere:
• cookie di sessione, eliminati automaticamente alla chiusura del browser;
• cookie persistenti, conservati per un periodo limitato stabilito dal relativo fornitore.
La durata può variare in funzione della tipologia di cookie utilizzato.`
  },
  {
    title: '14. GESTIONE DEL CONSENSO',
    content: `L'utente può in qualsiasi momento:
• accettare i cookie;
• rifiutare quelli non necessari;
• modificare le proprie preferenze;
• eliminare i cookie attraverso le impostazioni del browser.
La disabilitazione dei cookie tecnici potrebbe impedire il corretto funzionamento della piattaforma.`
  },
  {
    title: '15. AGGIORNAMENTI DELLA COOKIE POLICY',
    content: `La presente Cookie Policy potrà essere aggiornata in qualsiasi momento in conseguenza di modifiche normative, tecniche o organizzative.
Le modifiche entreranno in vigore dalla loro pubblicazione sul sito.`
  },
  {
    title: '16. CONTATTI',
    content: `Per qualsiasi richiesta relativa alla presente Cookie Policy è possibile contattare:
Ni.Ca. s.a.s.
Viale Magna Grecia n.179, 88100 Catanzaro (CZ)
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it
Partita IVA: 01696960796`
  },
];

export default function CookiePolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Cookie Policy',
          headerStyle: { backgroundColor: '#1a472a' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 16 }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          isDesktop && styles.contentDesktop,
          { paddingBottom: insets.bottom + 40 }
        ]}
      >
        <View style={[styles.card, isDesktop && styles.cardDesktop]}>
          <Text style={styles.mainTitle}>COOKIE POLICY</Text>
          
          <View style={styles.versionBox}>
            <Text style={styles.versionText}>Versione 1.0</Text>
            <Text style={styles.versionText}>Ultimo aggiornamento: 16 luglio 2026</Text>
          </View>
          
          <Text style={styles.intro}>
            La presente Cookie Policy descrive le modalità di utilizzo dei cookie e di tecnologie analoghe da parte della piattaforma RiBook.it, di proprietà di Ni.Ca. s.a.s., in conformità al Regolamento (UE) 2016/679 (GDPR), al D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018 e alle Linee Guida del Garante per la Protezione dei Dati Personali.
          </Text>
          <Text style={styles.intro}>
            La presente Cookie Policy costituisce parte integrante della Privacy Policy disponibile sul sito.
          </Text>

          {SECTIONS.map((section, index) => (
            <View key={index}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.paragraph}>{section.content}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  contentDesktop: {
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardDesktop: {
    maxWidth: 800,
    width: '100%',
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a472a',
    marginBottom: 16,
    textAlign: 'center',
  },
  versionBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#666',
  },
  intro: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a472a',
    marginTop: 24,
    marginBottom: 12,
  },
  paragraph: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
});
