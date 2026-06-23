# LOGICA SCAMBIO LIBRI - RIBOOK

**VERSIONE STABILE** - Data: 23 Giugno 2026
**NON MODIFICARE SENZA AUTORIZZAZIONE**

---

## 1. STRUTTURA DATABASE

### Collezioni PROTETTE (NON CANCELLARE MAI):
- `books` - Dati MIUR 2025/2026 (7.555 libri per 19 scuole di Catanzaro)
- `adozioni` - Dati MIUR 2026/2027 (7.610 libri per 19 scuole di Catanzaro)
- `schools` - 19 scuole target di Catanzaro città
- `users` - Utenti registrati
- `listings` - Annunci di vendita
- `orders` - Ordini
- `notifications` - Notifiche
- `conversations` - Conversazioni chat
- `messages` - Messaggi chat

### Le 19 Scuole Target:
```
MEDIE (6):
- CZMM00300E - Convitto Nazionale P. Galluppi
- CZMM85201Q - IC Patari-Rodari
- CZMM856013 - IC Manzoni
- CZMM85801A - IC Casalinuovo
- CZMM86001P - IC Casalinuovo Sud
- CZMM86701D - IC Vivaldi

SUPERIORI (13):
- CZIS007001, CZPC060004, CZPS02000R, CZPS060003
- CZRH010004, CZSD02000T, CZTE01000Q, CZTF010008
- CZTE021011, CZSL02201A, etc.
```

---

## 2. LOGICA DI CLASSIFICAZIONE LIBRI

Per uno studente che passa da classe X (2025/2026) a classe X+1 (2026/2027):

### CATEGORIE:

#### 1. VENDIBILI USATI
- Libri che avevi in classe X (2025/2026)
- NON servono più in classe X+1 (2026/2027)
- Sono richiesti da ALMENO UNA delle 19 scuole target
- **ECCEZIONE**: Vol. U (Unici) NON sono vendibili se ancora in uso

#### 2. ANCORA IN USO
- Libri che avevi in classe X (2025/2026)
- SERVONO ANCORA in classe X+1 (2026/2027)
- Tipicamente: Volumi Unici (Vol. U) triennali

#### 3. DA ACQUISTARE USATI
- Libri che ti servono in classe X+1 (2026/2027)
- NON avevi già
- ESISTEVANO nelle 19 scuole target nel 2025/2026:
  - **Vol. 1, 2, 3** (annuali): cerca nella classe corrispondente al volume
  - **Vol. U** (triennali): cerca in classe 3 (chi ha finito le medie può vendere)

#### 4. DA ACQUISTARE NUOVI
- Libri che ti servono in classe X+1 (2026/2027)
- NON esistevano nelle 19 scuole target nel 2025/2026
- OPPURE sono marcati come `nuova_adozione=True`
- **ECCEZIONE**: Se c'è un listing attivo → va in "USATI" con flag `eccezionale=true`

#### 5. FUORI CORSO
- Libri che avevi in classe X (2025/2026)
- NON sono richiesti da NESSUNA scuola nel 2026/2027

---

## 3. LOGICA ECCEZIONALE

Quando un libro normalmente NON sarebbe disponibile usato, ma qualcuno lo mette in vendita (es. ha cambiato scuola):

1. Appare in "DA ACQUISTARE USATI" invece di "NUOVI"
2. Ha flag `eccezionale: true`
3. Badge arancione con "ECCEZ. X copie"
4. Motivo: "ECCEZIONALMENTE: X copia/copie disponibile"

---

## 4. FILE CRITICI

### Backend:
- `/app/backend/book_logic_v2.py` - LOGICA PRINCIPALE
- `/app/backend/server.py` - API endpoints

### Frontend:
- `/app/frontend/app/(tabs)/index.tsx` - Home con categorie libri

---

## 5. ISBN SPECIALI

### Let's Move (Casalinuovo CZMM86001P):
- ISBN: `9788839304292` (nuova edizione)
- Volume: U (Unico triennale)

---

## AVVERTENZE

⚠️ **NON** cancellare le collezioni `books` e `adozioni`
⚠️ **NON** modificare `book_logic_v2.py` senza test approfonditi
⚠️ **NON** importare dati da scuole fuori Catanzaro città
⚠️ **SEMPRE** fare backup prima di modifiche ai dati
