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
    content: `Il Titolare del trattamento dei dati personali è:
Ni.Ca. s.a.s.
Viale Magna Grecia 179, 88100 Catanzaro (CZ)
Partita IVA: 01696960796
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it`
  },
  {
    title: '2. COSA FA RIBOOK',
    content: `RiBook è una piattaforma digitale dedicata alla compravendita di libri scolastici usati.
La piattaforma mette in contatto venditori ed acquirenti e coordina il processo di vendita mediante una rete di cartolibrerie convenzionate.
RiBook tratta esclusivamente i dati necessari all'erogazione dei servizi offerti.`
  },
  {
    title: '3. QUALI DATI RACCOGLIAMO',
    content: `Durante l'utilizzo della piattaforma possono essere raccolti:

Dati identificativi: nome, cognome, codice fiscale, data di nascita, indirizzo e-mail.

Dati di autenticazione: Qualora l'utente scelga di registrarsi mediante Google Login, RiBook potrà ricevere: nome, cognome, indirizzo e-mail, identificativo dell'account Google secondo le autorizzazioni concesse dall'utente. RiBook non acquisisce né conserva la password dell'account Google.

Dati relativi ai Profili Studente: Per ogni profilo potranno essere trattati: scuola, classe, sezione. Tali informazioni vengono utilizzate esclusivamente per individuare i libri scolastici adottati.

Dati relativi agli ordini: Durante gli acquisti vengono trattati: libri acquistati, libri venduti, importi, stato degli ordini, cartolibreria selezionata, cronologia delle operazioni.

Dati relativi alle contestazioni: Qualora venga aperta una contestazione potranno essere trattati: fotografie, descrizioni, comunicazioni, documentazione inviata dall'utente.

Dati tecnici: Durante la navigazione possono essere raccolti automaticamente: indirizzo IP, data e ora di accesso, browser utilizzato, sistema operativo, log di sicurezza, identificativi tecnici della sessione.`
  },
  {
    title: '4. FINALITÀ DEL TRATTAMENTO',
    content: `I dati vengono trattati per:
• consentire la registrazione;
• autenticare gli utenti;
• creare il Profilo Studente;
• mostrare i libri adottati;
• pubblicare annunci;
• acquistare libri;
• gestire gli ordini;
• verificare i libri;
• gestire contestazioni;
• prevenire frodi;
• garantire la sicurezza della piattaforma;
• adempiere agli obblighi di legge.`
  },
  {
    title: '5. BASE GIURIDICA DEL TRATTAMENTO',
    content: `Il trattamento dei dati è fondato su:
• esecuzione del contratto;
• adempimento di obblighi di legge;
• legittimo interesse del Titolare;
• consenso dell'interessato ove richiesto.`
  },
  {
    title: '6. CODICE FISCALE',
    content: `Il Codice Fiscale viene richiesto esclusivamente per:
• identificare correttamente l'utente;
• evitare registrazioni multiple;
• prevenire utilizzi fraudolenti;
• migliorare la sicurezza della piattaforma.
Il Codice Fiscale non viene pubblicato né comunicato agli altri utenti.`
  },
  {
    title: '7. PAGAMENTI',
    content: `I pagamenti vengono effettuati mediante Stripe o altri prestatori di servizi di pagamento eventualmente integrati nella piattaforma.
RiBook non memorizza i dati completi delle carte di pagamento.
Le informazioni relative al pagamento vengono trattate direttamente dal prestatore del servizio secondo la propria informativa privacy.`
  },
  {
    title: '8. CARTOLIBRERIE CONVENZIONATE',
    content: `Le cartolibrerie convenzionate possono trattare esclusivamente i dati necessari per:
• ricevere i libri;
• verificarne lo stato;
• custodirli temporaneamente;
• consegnarli agli acquirenti;
• gestire le procedure previste dai Termini e Condizioni.
Le cartolibrerie sono tenute a trattare i dati nel rispetto della normativa vigente.`
  },
  {
    title: '9. MESSAGGISTICA',
    content: `La piattaforma mette a disposizione un sistema di comunicazione limitato.
RiBook può effettuare controlli automatici sui messaggi esclusivamente al fine di impedire:
• scambio di recapiti personali;
• comportamenti fraudolenti;
• utilizzi contrari ai Termini e Condizioni.
I controlli sono limitati a quanto strettamente necessario alla tutela della piattaforma.`
  },
  {
    title: '10. ANONIMATO',
    content: `RiBook tutela la riservatezza degli utenti.
Durante la compravendita non vengono mostrati agli altri utenti: nome, cognome, codice fiscale, e-mail, numero di telefono, indirizzo.
Gli utenti vengono identificati esclusivamente mediante le funzionalità previste dalla piattaforma.`
  },
  {
    title: '11. CONSERVAZIONE DEI DATI',
    content: `I dati personali vengono conservati per il tempo strettamente necessario al conseguimento delle finalità per le quali sono stati raccolti.
In particolare:
• dati dell'account: fino alla cancellazione dell'account, salvo diversi obblighi di legge;
• dati relativi agli ordini: per il periodo previsto dalla normativa fiscale e civilistica;
• dati relativi ai pagamenti: secondo quanto previsto dal prestatore del servizio di pagamento;
• dati relativi alle contestazioni: fino alla definizione della controversia e per il tempo necessario alla tutela dei diritti del Titolare;
• log tecnici e di sicurezza: per il tempo necessario alla prevenzione di frodi, accessi non autorizzati e tutela della piattaforma.
Decorso il periodo di conservazione, i dati saranno cancellati o anonimizzati, salvo obblighi di legge.`
  },
  {
    title: '12. COMUNICAZIONE DEI DATI',
    content: `I dati personali non vengono diffusi.
Potranno essere comunicati esclusivamente ai soggetti strettamente necessari all'erogazione del servizio, quali:
• cartolibrerie convenzionate;
• fornitori di servizi informatici;
• fornitori di servizi cloud;
• gestori dei pagamenti elettronici;
• consulenti fiscali e legali;
• autorità pubbliche quando previsto dalla legge;
• soggetti incaricati della manutenzione della piattaforma.
Tutti i soggetti coinvolti trattano i dati esclusivamente nei limiti delle proprie competenze e nel rispetto della normativa vigente.`
  },
  {
    title: '13. TRASFERIMENTO DEI DATI',
    content: `I dati personali sono trattati prevalentemente all'interno dello Spazio Economico Europeo.
Qualora alcuni servizi utilizzati dalla piattaforma comportino un trasferimento verso Paesi extra UE, tale trasferimento avverrà esclusivamente nel rispetto degli articoli 44 e seguenti del Regolamento (UE) 2016/679.
RiBook adotterà tutte le garanzie previste dalla normativa applicabile.`
  },
  {
    title: '14. SICUREZZA',
    content: `RiBook adotta misure tecniche ed organizzative adeguate a proteggere i dati personali contro:
• accessi non autorizzati;
• perdita accidentale;
• distruzione;
• divulgazione non autorizzata;
• utilizzo illecito.
Tra le misure adottate possono rientrare: connessioni protette HTTPS, cifratura delle comunicazioni, autenticazione degli utenti, controllo degli accessi, sistemi di monitoraggio, backup periodici, registrazione degli eventi di sicurezza.
Nessun sistema informatico può tuttavia garantire un livello assoluto di sicurezza.`
  },
  {
    title: "15. DIRITTI DELL'INTERESSATO",
    content: `L'interessato può esercitare in qualsiasi momento i diritti previsti dagli articoli 15 e seguenti del GDPR.
In particolare può richiedere:
• accesso ai dati;
• rettifica;
• cancellazione;
• limitazione del trattamento;
• portabilità dei dati;
• opposizione al trattamento nei casi previsti dalla legge.
Le richieste potranno essere inviate all'indirizzo e-mail del Titolare.
RiBook risponderà entro i termini previsti dalla normativa vigente.`
  },
  {
    title: "16. CANCELLAZIONE DELL'ACCOUNT",
    content: `L'utente può richiedere in qualsiasi momento la cancellazione del proprio account.
La cancellazione non comporta automaticamente l'eliminazione dei dati che il Titolare è tenuto a conservare per obblighi di legge o per la tutela dei propri diritti.
Restano inoltre salvi gli ordini già conclusi e le eventuali procedure ancora in corso.`
  },
  {
    title: '17. REVOCA DEL CONSENSO',
    content: `Qualora il trattamento sia basato sul consenso, l'utente può revocarlo in qualsiasi momento.
La revoca non pregiudica la liceità del trattamento effettuato prima della stessa.`
  },
  {
    title: "18. RECLAMO ALL'AUTORITÀ GARANTE",
    content: `L'interessato ha diritto di proporre reclamo al:
Garante per la Protezione dei Dati Personali
Piazza Venezia n.11, 00187 Roma
www.garanteprivacy.it
Resta salva la possibilità di adire l'Autorità Giudiziaria competente.`
  },
  {
    title: '19. MODIFICHE ALLA PRESENTE INFORMATIVA',
    content: `RiBook si riserva il diritto di modificare la presente Informativa in qualsiasi momento.
Le modifiche saranno pubblicate sul sito con indicazione della data di aggiornamento.
L'utilizzo della piattaforma successivamente alla pubblicazione delle modifiche costituisce presa visione della nuova Informativa.`
  },
  {
    title: '20. CONTATTI',
    content: `Per qualsiasi richiesta relativa al trattamento dei dati personali è possibile contattare:
Ni.Ca. s.a.s.
Viale Magna Grecia 179, 88100 Catanzaro (CZ)
Partita IVA: 01696960796
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it`
  },
  {
    title: '21. UTILIZZO DI ALGORITMI E PROCESSI AUTOMATIZZATI',
    content: `RiBook utilizza sistemi informatici e procedure automatizzate per migliorare l'esperienza degli utenti e organizzare il funzionamento della piattaforma.
In particolare, tali sistemi possono essere impiegati per:
• classificare automaticamente i libri scolastici;
• individuare la compatibilità dei testi con scuola, classe e sezione;
• suggerire un prezzo indicativo di vendita sulla base di criteri oggettivi;
• individuare libri non più adottati o non più vendibili;
• prevenire attività fraudolente;
• migliorare la sicurezza della piattaforma.
Le elaborazioni effettuate hanno esclusivamente finalità organizzative e di supporto.
RiBook non adotta decisioni completamente automatizzate che producano effetti giuridici nei confronti dell'utente ai sensi dell'articolo 22 del Regolamento (UE) 2016/679.
L'utente mantiene sempre la possibilità di determinare autonomamente il prezzo del libro e di scegliere se pubblicare o meno un annuncio.`
  },
  {
    title: '22. DATI DEI PROFILI STUDENTE',
    content: `Le informazioni relative al Profilo Studente (scuola, classe e sezione) sono trattate esclusivamente per consentire il corretto funzionamento della piattaforma.
Tali dati permettono a RiBook di:
• individuare i libri adottati;
• determinare la compatibilità dei testi tra gli anni scolastici;
• organizzare automaticamente le categorie dei libri;
• agevolare la compravendita.
Le informazioni relative ai Profili Studente non vengono diffuse pubblicamente e non vengono utilizzate per attività di marketing o profilazione commerciale.
L'eventuale presenza di dati riferibili a studenti minorenni deriva esclusivamente dalle informazioni inserite dall'utente maggiorenne titolare dell'account.
RiBook invita i genitori o gli esercenti la responsabilità genitoriale a utilizzare la piattaforma direttamente, evitando la registrazione da parte di minori.`
  },
  {
    title: '23. CLAUSOLA SULLA VERIDICITÀ DELLE FOTOGRAFIE',
    content: `Il venditore dichiara che tutte le fotografie pubblicate rappresentano il libro effettivamente posto in vendita.
È vietato utilizzare immagini reperite da Internet, immagini appartenenti ad altri utenti o fotografie che possano indurre in errore l'acquirente.
RiBook potrà rimuovere le inserzioni contenenti fotografie non veritiere e sospendere l'account dell'utente.`
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Privacy Policy',
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
          <Text style={styles.mainTitle}>PRIVACY POLICY</Text>
          
          <Text style={styles.intro}>
            La presente Informativa è resa ai sensi del Regolamento (UE) 2016/679 (GDPR), del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018 e della normativa italiana vigente in materia di protezione dei dati personali.
          </Text>
          <Text style={styles.intro}>
            {"L'utilizzo della piattaforma RiBook comporta il trattamento di dati personali secondo quanto descritto nella presente Informativa."}
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
    marginBottom: 24,
    textAlign: 'center',
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
