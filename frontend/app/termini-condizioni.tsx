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

// Contenuto dei Termini e Condizioni in formato testo semplice
const SECTIONS = [
  {
    title: '1. TITOLARE DELLA PIATTAFORMA',
    content: `La piattaforma "RiBook" è gestita da:
Ni.Ca. s.a.s.
Sede legale: Viale Magna Grecia n.179, 88100 Catanzaro (CZ)
Partita IVA: 01696960796
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it
Di seguito denominata "RiBook" oppure "Gestore".`
  },
  {
    title: '2. PREMESSE',
    content: `Le presenti Condizioni Generali disciplinano l'accesso, la registrazione e l'utilizzo della piattaforma RiBook.
L'utilizzo della piattaforma comporta la completa accettazione delle presenti Condizioni.
Qualora l'utente non accetti anche una sola delle presenti clausole dovrà interrompere immediatamente l'utilizzo del servizio.
Le presenti Condizioni costituiscono contratto ai sensi degli articoli 1321 e seguenti del Codice Civile.`
  },
  {
    title: "3. COS'È RIBOOK",
    content: `RiBook è una piattaforma digitale che facilita la compravendita di libri scolastici usati adottati dagli istituti scolastici presenti sul territorio servito dalla piattaforma.
RiBook non è una libreria online.
RiBook non acquista né rivende direttamente libri.
RiBook svolge esclusivamente attività di intermediazione tecnologica tra utenti registrati e coordina il processo di verifica, consegna e ritiro attraverso cartolibrerie convenzionate.`
  },
  {
    title: '4. FINALITÀ DELLA PIATTAFORMA',
    content: `La piattaforma nasce con lo scopo di:
• favorire il riutilizzo dei libri scolastici;
• ridurre i costi sostenuti dalle famiglie;
• limitare gli sprechi;
• creare un sistema controllato di compravendita locale;
• garantire maggiore sicurezza rispetto ai tradizionali marketplace.`
  },
  {
    title: '5. DEFINIZIONI',
    content: `Ai fini delle presenti Condizioni si intende per:
Piattaforma: il sito internet RiBook.it e tutte le relative applicazioni.
Utente: qualsiasi persona registrata sulla piattaforma.
Venditore: l'utente che pubblica uno o più libri.
Acquirente: l'utente che acquista uno o più libri.
Profilo Studente: profilo associato ad uno specifico alunno contenente scuola, classe e sezione.
Cartolibreria Convenzionata: esercizio commerciale autorizzato da RiBook alla verifica, ricezione, custodia e consegna dei libri.
Catalogo Libri: insieme dei libri scolastici elaborato sulla base delle adozioni comunicate dagli istituti scolastici e dalle banche dati ufficiali.
Ordine: procedura di acquisto conclusa mediante pagamento.
Contestazione: procedura attraverso la quale l'acquirente segnala una difformità del libro acquistato.`
  },
  {
    title: '6. REQUISITI PER L\'UTILIZZO',
    content: `Possono utilizzare RiBook esclusivamente persone maggiorenni.
L'utente dichiara di possedere la capacità giuridica necessaria per concludere contratti.
Qualora un genitore desideri utilizzare RiBook per conto di un figlio minorenne, dovrà registrarsi personalmente assumendo ogni responsabilità derivante dall'utilizzo della piattaforma.
RiBook si riserva il diritto di sospendere o eliminare qualsiasi account creato in violazione della presente disposizione.`
  },
  {
    title: '7. REGISTRAZIONE',
    content: `La registrazione può avvenire:
• mediante compilazione del modulo presente sul sito;
• oppure tramite autenticazione Google.
Durante la registrazione potranno essere richiesti: Nome, Cognome, Indirizzo e-mail, Codice Fiscale, Data di nascita.
L'utente garantisce che tutti i dati inseriti sono completi, corretti e aggiornati.
L'inserimento di dati falsi costituisce grave violazione delle presenti Condizioni.
RiBook potrà richiedere in qualsiasi momento documentazione idonea a verificare l'identità dell'utente.`
  },
  {
    title: '8. CODICE FISCALE',
    content: `Il Codice Fiscale viene richiesto esclusivamente per:
• identificare correttamente l'utente;
• evitare registrazioni multiple;
• prevenire frodi;
• aumentare la sicurezza della piattaforma;
• adempiere agli obblighi di legge.
Il Codice Fiscale non viene mai mostrato pubblicamente agli altri utenti.`
  },
  {
    title: '9. PROFILI STUDENTE',
    content: `Dopo la registrazione l'utente potrà creare uno o più Profili Studente.
Ogni Profilo Studente è associato a: scuola, classe, sezione.
Una volta creato il Profilo Studente tali dati non potranno essere modificati.
Qualora siano stati inseriti dati errati, l'utente potrà eliminare il proprio account e crearne uno nuovo.`
  },
  {
    title: '10. CATALOGO LIBRI',
    content: `Il catalogo presente sulla piattaforma è costruito utilizzando dati provenienti dalle adozioni scolastiche ufficiali pubblicate dagli istituti scolastici e dalle fonti ministeriali disponibili.
RiBook compie ogni ragionevole sforzo per mantenere aggiornato il catalogo.
Tuttavia eventuali modifiche effettuate dagli istituti scolastici successivamente alla pubblicazione delle adozioni potrebbero non risultare immediatamente disponibili.
L'utente è sempre tenuto a verificare con il proprio istituto scolastico la correttezza del libro da acquistare.`
  },
  {
    title: '11. CATEGORIE DEI LIBRI',
    content: `RiBook organizza automaticamente i libri scolastici in categorie al fine di semplificare l'esperienza dell'utente.
Le categorie potranno comprendere, a titolo esemplificativo:
• Libri vendibili usati;
• Libri acquistabili usati;
• Libri acquistabili esclusivamente nuovi;
• Libri ancora in uso nell'anno scolastico successivo;
• Libri non più adottati e pertanto non vendibili tramite la piattaforma.
La classificazione viene effettuata automaticamente sulla base delle adozioni scolastiche disponibili.
RiBook si riserva il diritto di modificare la classificazione qualora intervengano variazioni delle adozioni o vengano riscontrati errori.`
  },
  {
    title: '12. INSERIMENTO DI UN LIBRO',
    content: `Il venditore può mettere in vendita esclusivamente libri presenti nel Catalogo RiBook.
Per ciascun libro dovranno essere inserite informazioni veritiere e complete.
L'annuncio dovrà descrivere fedelmente lo stato del libro.
È vietato pubblicare annunci riferiti a libri diversi rispetto a quelli realmente posseduti.
RiBook si riserva il diritto di eliminare qualsiasi inserzione ritenuta incompleta, ingannevole o non conforme.`
  },
  {
    title: '13. STATO DEL LIBRO',
    content: `Durante la pubblicazione dell'annuncio il venditore dovrà indicare con precisione le condizioni del libro.
A titolo esemplificativo potranno essere indicate:
• presenza di scritte a matita;
• presenza di scritte a penna;
• esercizi svolti;
• pagine evidenziate;
• usura della copertina;
• usura delle pagine;
• eventuali danni;
• ogni altra informazione utile per descrivere il reale stato del libro.
Il venditore è responsabile della veridicità delle informazioni inserite.
Qualsiasi dichiarazione falsa potrà comportare la sospensione dell'account.`
  },
  {
    title: '14. FOTOGRAFIE',
    content: `Per ogni libro è obbligatorio inserire almeno una fotografia della copertina.
Possono essere caricate fino ad un massimo di tre fotografie.
Le immagini devono rappresentare il libro realmente posto in vendita.
Non sono consentite fotografie reperite da Internet o appartenenti ad altri utenti.
RiBook potrà rimuovere immagini non conformi.`
  },
  {
    title: '15. PREZZO',
    content: `RiBook potrà suggerire un prezzo orientativo sulla base di algoritmi interni e dell'andamento del mercato.
Il prezzo finale viene stabilito esclusivamente dal venditore.
Non sono previsti importi minimi né massimi.
L'utente è l'unico responsabile del prezzo pubblicato.`
  },
  {
    title: '16. RESPONSABILITÀ DEL VENDITORE',
    content: `Il venditore garantisce che:
• è proprietario del libro;
• il libro può essere legittimamente venduto;
• il libro corrisponde alla descrizione pubblicata;
• le fotografie rappresentano il bene reale;
• il libro non viola diritti di terzi.
Il venditore risponde personalmente di eventuali dichiarazioni mendaci.`
  },
  {
    title: '17. ACQUISTO',
    content: `L'acquirente può acquistare esclusivamente libri disponibili.
Prima della conferma dell'ordine vengono mostrati: prezzo del libro, eventuali commissioni, cartolibreria selezionata, riepilogo dell'ordine.
Con la conferma dell'ordine l'acquirente conclude un contratto di compravendita con il venditore.
RiBook interviene esclusivamente quale piattaforma di intermediazione.`
  },
  {
    title: '18. PAGAMENTO',
    content: `I pagamenti sono gestiti tramite Stripe o altri prestatori di servizi di pagamento eventualmente integrati nella piattaforma.
RiBook non memorizza i dati completi delle carte di pagamento.
Il pagamento viene effettuato al momento della conferma dell'ordine.
L'importo rimane temporaneamente vincolato secondo le procedure previste dalla piattaforma e dal prestatore del servizio di pagamento.`
  },
  {
    title: '19. CONSEGNA DEL LIBRO',
    content: `Dopo l'acquisto il venditore dovrà consegnare il libro presso la cartolibreria convenzionata selezionata.
Il mancato rispetto dei termini di consegna comporta l'annullamento automatico dell'ordine.
RiBook potrà applicare limitazioni all'account del venditore in caso di ripetuti inadempimenti.`
  },
  {
    title: '20. VERIFICA DEL LIBRO',
    content: `La cartolibreria convenzionata effettua un controllo materiale del libro.
La verifica riguarda esclusivamente: corrispondenza del titolo, corrispondenza dell'edizione, stato generale, conformità rispetto alla descrizione pubblicata.
La cartolibreria può rifiutare il libro qualora riscontri difformità rilevanti.
Il rifiuto viene comunicato al venditore e all'acquirente.`
  },
  {
    title: "21. RITIRO DA PARTE DELL'ACQUIRENTE",
    content: `L'acquirente riceverà comunicazione della disponibilità del libro.
Il ritiro dovrà avvenire entro il termine indicato dalla piattaforma.
Decorso inutilmente tale termine, il libro potrà essere nuovamente messo in vendita secondo quanto previsto dalle presenti Condizioni.`
  },
  {
    title: '22. CONTESTAZIONI',
    content: `L'acquirente dispone di tre (3) giorni dal ritiro del libro per segnalare eventuali palesi difformità rispetto alla descrizione pubblicata.
Le contestazioni dovranno essere dettagliate e corredate, ove possibile, da documentazione fotografica.
Non costituiscono motivo di contestazione lievi difetti normalmente riscontrabili nei libri usati e già dichiarati nell'annuncio.
La decisione finale sulla contestazione spetta esclusivamente a RiBook.
Le decisioni assunte da RiBook sono vincolanti ai fini della gestione dell'ordine sulla piattaforma.`
  },
  {
    title: '23. LIBRI NON RITIRATI',
    content: `Qualora l'acquirente non provveda al ritiro del libro entro il termine indicato dalla piattaforma, l'ordine si intenderà decaduto.
Il venditore manterrà la proprietà del libro.
Il libro rimarrà depositato presso la cartolibreria convenzionata secondo le modalità previste dalle presenti Condizioni.
La cartolibreria non assume obblighi di custodia illimitata.`
  },
  {
    title: '24. RIMESSA IN VENDITA',
    content: `Decorso il termine di ritiro senza che l'acquirente abbia ritirato il libro, la cartolibreria è autorizzata a rimettere automaticamente il libro in vendita tramite la piattaforma RiBook.
La nuova vendita potrà avvenire al prezzo ritenuto più idoneo dalla cartolibreria in funzione delle condizioni del libro e dell'andamento del mercato.
Nel caso in cui il libro venga successivamente venduto, al proprietario originario sarà riconosciuto il 70% del prezzo effettivamente incassato.
Il restante importo resterà acquisito dalla cartolibreria quale corrispettivo per le attività di custodia, gestione, esposizione, promozione e vendita.
Il venditore accetta espressamente tale modalità aderendo alle presenti Condizioni.`
  },
  {
    title: '25. GIACENZA',
    content: `I libri rimessi in vendita potranno rimanere presso la cartolibreria per un periodo massimo di sessanta (60) giorni.
Durante tale periodo RiBook potrà inviare comunicazioni al proprietario del libro tramite e-mail, notifiche o altri strumenti messi a disposizione dalla piattaforma.
Il venditore è tenuto a mantenere aggiornati i propri recapiti.
L'eventuale mancata ricezione delle comunicazioni dovuta a dati errati o non aggiornati non potrà essere imputata a RiBook o alla cartolibreria.`
  },
  {
    title: '26. MANCATA VENDITA, DONAZIONE E MACERO',
    content: `Qualora il libro non venga venduto entro sessanta (60) giorni dalla rimessa in vendita, RiBook inviterà il proprietario a ritirarlo presso la cartolibreria entro quindici (15) giorni.
Decorso inutilmente anche tale termine, il venditore autorizza sin d'ora RiBook e la cartolibreria, a loro discrezione, a:
• donare il libro ad associazioni, biblioteche, scuole o enti senza scopo di lucro;
• oppure destinare il libro al riciclo della carta o al macero qualora risulti obsoleto, deteriorato o non più commerciabile.
Con l'accettazione delle presenti Condizioni il venditore rinuncia a qualsiasi pretesa economica, risarcitoria o restitutoria relativamente ai libri non ritirati entro i termini sopra indicati.`
  },
  {
    title: '27. COMMISSIONI',
    content: `Per ogni compravendita conclusa tramite RiBook potranno essere applicate commissioni di intermediazione.
Le commissioni saranno chiaramente indicate all'utente prima della conferma dell'ordine.
RiBook si riserva la facoltà di modificare le commissioni dandone preventiva comunicazione attraverso la piattaforma.
Le eventuali commissioni applicate dai prestatori dei servizi di pagamento restano disciplinate dai rispettivi contratti.`
  },
  {
    title: '28. CARTOLIBRERIE CONVENZIONATE',
    content: `Le cartolibrerie aderenti alla rete RiBook operano sulla base di specifici accordi stipulati con il Gestore della piattaforma.
Le cartolibrerie svolgono attività di: ricezione dei libri, verifica dello stato, custodia temporanea, consegna agli acquirenti, gestione della rimessa in vendita, eventuali ulteriori attività previste dagli accordi con RiBook.
Le cartolibrerie non sono parti del contratto di compravendita tra venditore e acquirente.`
  },
  {
    title: '29. ANONIMATO DEGLI UTENTI',
    content: `RiBook tutela la riservatezza degli utenti.
Durante la compravendita non vengono comunicati agli altri utenti dati personali quali: nome, cognome, indirizzo, numero di telefono, indirizzo e-mail.
Le comunicazioni avvengono esclusivamente mediante gli strumenti messi a disposizione dalla piattaforma.`
  },
  {
    title: '30. SISTEMA DI MESSAGGISTICA',
    content: `La piattaforma mette a disposizione un sistema di messaggistica limitato e controllato.
RiBook potrà impedire automaticamente l'invio di: numeri telefonici, indirizzi e-mail, link esterni, account social, dati personali, qualunque altro contenuto finalizzato ad eludere il corretto funzionamento della piattaforma.
È vietato utilizzare la messaggistica per concludere accordi al di fuori di RiBook.`
  },
  {
    title: '31. DIVIETO DI ELUSIONE DELLA PIATTAFORMA',
    content: `RiBook investe risorse economiche, tecnologiche ed organizzative per mettere in contatto venditori ed acquirenti.
È pertanto vietato utilizzare la piattaforma esclusivamente per individuare un venditore o un acquirente e concludere successivamente la compravendita al di fuori di RiBook.
Sono vietati, a titolo esemplificativo:
• lo scambio di recapiti personali;
• l'invito ad incontrarsi privatamente;
• la conclusione della vendita senza utilizzare RiBook;
• qualsiasi comportamento diretto ad evitare il pagamento delle commissioni previste.
RiBook potrà sospendere o chiudere definitivamente gli account coinvolti.`
  },
  {
    title: '32. ACCOUNT',
    content: `L'utente è responsabile della custodia delle proprie credenziali.
Ogni attività effettuata tramite l'account si presume eseguita dal titolare.
L'utente dovrà comunicare immediatamente qualsiasi utilizzo non autorizzato del proprio account.
RiBook potrà sospendere temporaneamente l'accesso qualora rilevi attività anomale o sospette.`
  },
  {
    title: "33. SOSPENSIONE ED ELIMINAZIONE DELL'ACCOUNT",
    content: `RiBook potrà sospendere o eliminare un account nei seguenti casi:
• dati falsi;
• utilizzo fraudolento della piattaforma;
• tentativi di truffa;
• vendita di libri diversi da quelli dichiarati;
• ripetute contestazioni fondate;
• mancata consegna dei libri;
• comportamenti offensivi;
• violazione delle presenti Condizioni.
L'utente potrà richiedere la cancellazione del proprio account in qualsiasi momento, fermo restando il completamento degli ordini già conclusi.`
  },
  {
    title: '34. OBBLIGHI DEGLI UTENTI',
    content: `Gli utenti si impegnano a:
• utilizzare RiBook secondo buona fede;
• fornire informazioni corrette;
• rispettare gli altri utenti;
• rispettare le decisioni adottate da RiBook nelle procedure di contestazione;
• non utilizzare software automatici, bot o strumenti idonei ad alterare il funzionamento della piattaforma.`
  },
  {
    title: '35. RESPONSABILITÀ DI RIBOOK',
    content: `RiBook opera esclusivamente quale piattaforma di intermediazione.
Salvo i casi previsti dalla legge, RiBook non garantisce: la vendita dei libri, l'acquisto dei libri, la permanenza delle inserzioni, la disponibilità continua della piattaforma.
RiBook non è responsabile per: dichiarazioni mendaci degli utenti, errori nelle adozioni scolastiche comunicate dagli istituti, ritardi imputabili ai prestatori di servizi di pagamento, interruzioni della rete Internet, eventi di forza maggiore.`
  },
  {
    title: '36. RESPONSABILITÀ DELLE CARTOLIBRERIE',
    content: `Le cartolibrerie convenzionate effettuano esclusivamente una verifica materiale dello stato apparente del libro.
Tale verifica non costituisce perizia tecnica né certificazione assoluta.
Le cartolibrerie non rispondono di difetti non rilevabili mediante ordinaria diligenza.`
  },
  {
    title: '37. PROPRIETÀ INTELLETTUALE',
    content: `Il marchio RiBook, il logo, la grafica, il software, il database, il codice sorgente, le immagini e tutti i contenuti della piattaforma costituiscono proprietà esclusiva del Gestore o dei rispettivi titolari dei diritti.
È vietata qualsiasi riproduzione, distribuzione o utilizzo non autorizzato.`
  },
  {
    title: '38. DATI PERSONALI',
    content: `Il trattamento dei dati personali è disciplinato dalla Privacy Policy pubblicata sul sito.
L'utilizzo della piattaforma comporta la presa visione della Privacy Policy.`
  },
  {
    title: '39. COOKIE',
    content: `La piattaforma utilizza cookie tecnici e gli eventuali ulteriori cookie descritti nella Cookie Policy.
L'utente è invitato a consultare la Cookie Policy prima dell'utilizzo del servizio.`
  },
  {
    title: '40. MODIFICHE DEL SERVIZIO',
    content: `RiBook si riserva il diritto di modificare, aggiornare o migliorare in qualsiasi momento le funzionalità della piattaforma.
Tali modifiche non attribuiscono agli utenti alcun diritto al mantenimento delle precedenti funzionalità.`
  },
  {
    title: '41. MODIFICHE ALLE PRESENTI CONDIZIONI',
    content: `RiBook può modificare le presenti Condizioni in qualsiasi momento.
Le modifiche saranno pubblicate sul sito con indicazione della data di aggiornamento.
L'utilizzo della piattaforma successivamente alla pubblicazione costituisce accettazione delle modifiche.`
  },
  {
    title: '42. LEGGE APPLICABILE',
    content: `Le presenti Condizioni sono disciplinate dalla legge italiana.
Per quanto non espressamente previsto trovano applicazione il Codice Civile, il Codice del Consumo, il Regolamento (UE) 2016/679 (GDPR) e le ulteriori disposizioni vigenti.`
  },
  {
    title: '43. FORO COMPETENTE',
    content: `Qualora l'utente rivesta la qualità di consumatore sarà competente il Foro previsto dalla normativa vigente.
Negli altri casi sarà competente in via esclusiva il Foro di Catanzaro.`
  },
  {
    title: '44. CLAUSOLE FINALI',
    content: `Qualora una delle disposizioni delle presenti Condizioni venga dichiarata nulla o inefficace, le restanti disposizioni continueranno ad avere piena efficacia.
L'eventuale tolleranza di RiBook rispetto a comportamenti contrari alle presenti Condizioni non costituisce rinuncia ai propri diritti.`
  },
  {
    title: '45. CONTATTI',
    content: `Per qualsiasi informazione è possibile contattare:
Ni.Ca. s.a.s.
Viale Magna Grecia n.179, 88100 Catanzaro (CZ)
P. IVA 01696960796
Email: nica.cartolibreria@gmail.com
PEC: carto.nica@pec.it`
  },
];

export default function TerminiCondizioniScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Termini e Condizioni',
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
          <Text style={styles.mainTitle}>
            TERMINI E CONDIZIONI GENERALI DI UTILIZZO DELLA PIATTAFORMA RIBOOK
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
