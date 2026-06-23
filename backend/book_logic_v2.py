"""
LOGICA LIBRI v2 - Classificazione Automatica

4 CATEGORIE:
1. ANCORA IN USO - ISBN in 2025/2026 E in 2026/2027
2. VENDIBILI USATI - ISBN in 2025/2026 MA NON in 2026/2027  
3. DA ACQUISTARE USATI - ISBN richiesto 2026/2027 E disponibile da altri studenti
4. DA ACQUISTARE NUOVI - ISBN richiesto 2026/2027 MA NON disponibile usato

CASI PARTICOLARI:
- Prima classe (1ª media, 1ª superiore): niente 2025/2026 → solo cat. 3 e 4
- Ultima classe (3ª media, 5ª superiore): niente 2026/2027 → solo cat. 2
- LIBRI STRUMENTO MUSICALE: esclusi dal calcolo costi (chitarra, flauto, violino, pianoforte)
"""

from typing import List, Dict, Tuple, Optional, Set
from motor.motor_asyncio import AsyncIOMotorDatabase

# Parole chiave per identificare libri di strumento musicale (da escludere dal calcolo costi)
STRUMENTI_MUSICALI_KEYWORDS = [
    'chitarra', 'flauto', 'violino', 'pianoforte', 'pianistico', 'pianistica',
    'clarinetto', 'tromba', 'sassofono', 'percussioni', 'batteria',
    'violoncello', 'contrabbasso', 'oboe', 'fagotto', 'corno',
]

# =============================================================================
# MAPPATURA ISBN: Correzioni per libri che cambiano ISBN tra anni scolastici
# Formato: { 'isbn_vecchio': 'isbn_nuovo' }
# Quando un libro dell'anno precedente ha un ISBN che è stato sostituito,
# questa mappatura permette di riconoscerlo come lo stesso libro.
# =============================================================================
ISBN_MAPPING = {
    '9788839304292': '9788839303875',  # Let's Movie - vecchio ISBN → nuovo ISBN
}

def normalize_isbn(isbn: str) -> str:
    """
    Normalizza un ISBN applicando la mappatura se necessario.
    Se l'ISBN è nella mappatura, restituisce quello nuovo, altrimenti restituisce l'originale.
    """
    if not isbn:
        return isbn
    return ISBN_MAPPING.get(isbn, isbn)

def is_libro_strumento_musicale(libro: Dict) -> bool:
    """
    Verifica se un libro è un libro di strumento musicale (da escludere dal calcolo).
    
    I libri di strumento musicale sono quelli specifici per l'insegnamento di uno
    strumento (chitarra, flauto, violino, pianoforte, etc.).
    NON include il libro di "musica" generale (es. "Prima la musica").
    """
    titolo = (libro.get("titolo") or "").lower()
    disciplina = (libro.get("disciplina") or "").lower()
    
    # Se la disciplina non contiene "musica", non è un libro musicale
    if "music" not in disciplina:
        return False
    
    # Controlla se il titolo contiene parole chiave di strumenti
    for strumento in STRUMENTI_MUSICALI_KEYWORDS:
        if strumento in titolo:
            return True
    
    return False


async def get_libri_classe(
    db: AsyncIOMotorDatabase,
    codice_scuola: str,
    classe: int,
    sezione: str,
    anno_scolastico: str = "2026/2027"
) -> List[Dict]:
    """
    Recupera tutti i libri di una specifica classe/sezione.
    
    Args:
        db: Database MongoDB
        codice_scuola: Codice meccanografico scuola
        classe: Numero classe (1, 2, 3, etc.)
        sezione: Sezione (A, B, C, etc.)
        anno_scolastico: "2026/2027" (corrente) o "2025/2026" (precedente)
    
    Returns:
        Lista di libri con tutti i campi
    """
    # Scegli la collezione corretta
    if anno_scolastico == "2025/2026":
        collection = db.books  # Dati anno scorso
    else:
        collection = db.adozioni  # Dati anno corrente 2026/2027
    
    classe_str = str(classe)
    sezione_upper = sezione.upper() if sezione else "A"
    
    # Prima prova con sezione esatta
    libri = await collection.find({
        "codice_scuola": codice_scuola,
        "classe": classe_str,
        "sezione": sezione_upper
    }).to_list(None)
    
    # Fallback: qualsiasi sezione
    if not libri:
        libri = await collection.find({
            "codice_scuola": codice_scuola,
            "classe": classe_str
        }).to_list(None)
        
        if libri:
            # Prendi solo la prima sezione
            prima_sezione = libri[0].get("sezione")
            libri = [l for l in libri if l.get("sezione") == prima_sezione]
    
    # Normalizza formato
    return [{
        "isbn": l.get("isbn", ""),
        "titolo": l.get("titolo", ""),
        "autori": l.get("autori", ""),
        "editore": l.get("editore", ""),
        "disciplina": l.get("disciplina", ""),
        "prezzo": l.get("prezzo") or l.get("prezzo_copertina", 0),
        "volume": l.get("volume", ""),
        "da_acquistare": l.get("da_acquistare", True),
        "nuova_adozione": l.get("nuova_adozione", False),
        "consigliato": l.get("consigliato", False),
    } for l in libri if l.get("isbn")]


async def get_libri_classe_2025_2026(
    db: AsyncIOMotorDatabase,
    codice_scuola: str,
    classe: int,
    sezione: str
) -> List[Dict]:
    """
    Recupera libri dalla collezione 'books' per l'anno 2025/2026.
    Ogni documento è un singolo libro (non aggregato).
    """
    collection = db.books
    classe_str = str(classe)
    sezione_upper = sezione.upper() if sezione else "A"
    
    # Cerca libri per scuola/classe/sezione/anno
    libri = await collection.find({
        "codice_scuola": codice_scuola,
        "classe": classe_str,
        "sezione": sezione_upper,
        "anno_scolastico": "2025/2026"
    }).to_list(None)
    
    # Fallback: qualsiasi sezione della stessa scuola/classe
    if not libri:
        libri = await collection.find({
            "codice_scuola": codice_scuola,
            "classe": classe_str,
            "anno_scolastico": "2025/2026"
        }).to_list(None)
        
        if libri:
            # Prendi solo la prima sezione
            prima_sezione = libri[0].get("sezione")
            libri = [l for l in libri if l.get("sezione") == prima_sezione]
    
    return [{
        "isbn": l.get("isbn", ""),
        "titolo": l.get("titolo", ""),
        "autori": l.get("autori", ""),
        "editore": l.get("editore", ""),
        "disciplina": l.get("disciplina", ""),
        "prezzo": l.get("prezzo_copertina") or l.get("prezzo", 0),
        "volume": l.get("volume", ""),
        "da_acquistare": l.get("da_acquistare", True),
        "nuova_adozione": l.get("nuova_adozione", False),
        "consigliato": l.get("consigliato", False),
    } for l in libri if l.get("isbn")]


async def get_isbn_vendibili_catanzaro(
    db: AsyncIOMotorDatabase,
    isbn_richiesti: Set[str]
) -> Dict[str, List[Dict]]:
    """
    Per ogni ISBN richiesto, verifica se è disponibile come "vendibile usato"
    da qualche studente di QUALSIASI scuola di Catanzaro.
    
    LOGICA:
    
    1. LIBRI ANNUALI (Vol. 1, Vol. 2, Vol. 3):
       - Cerca in TUTTE le scuole di CZ nella classe corrispondente al volume
       - Vol. 2 → cerca chi lo aveva in 2ª nel 2025/2026 in QUALSIASI scuola
    
    2. LIBRI TRIENNALI (Vol. U o senza volume):
       - Cerca in TUTTE le scuole di CZ in classe 3
       - Solo chi ha finito le medie può venderli
    
    Returns:
        Dict[isbn_normalizzato] -> Lista di info venditori (scuola, classe, etc.)
    """
    vendibili = {}
    
    for isbn in isbn_richiesti:
        venditori = []
        
        # Normalizza l'ISBN per la ricerca
        isbn_norm = normalize_isbn(isbn)
        
        # Cerca info libro - prima in adozioni (ha volume), poi in books
        libro_info = await db.adozioni.find_one({"isbn": isbn})
        if not libro_info:
            libro_info = await db.adozioni.find_one({"isbn": isbn_norm})
        if not libro_info:
            libro_info = await db.books.find_one({"isbn": isbn_norm})
        if not libro_info:
            libro_info = await db.books.find_one({"isbn": isbn})
        
        if not libro_info:
            continue
        
        titolo = libro_info.get("titolo", "").upper()
        volume = libro_info.get("volume", "")
        
        # Determina se è un libro ANNUALE
        import re
        volume_match = re.search(r'VOL\.?\s*([123456])|VOLUME\s*([123456])|\bV\.\s*([123456])\b', titolo)
        is_libro_annuale = bool(volume_match)
        volume_number = None
        if volume_match:
            volume_number = volume_match.group(1) or volume_match.group(2) or volume_match.group(3)
        
        # Controlla anche il campo volume direttamente
        if not is_libro_annuale and volume in ['1', '2', '3', '4', '5', '6']:
            is_libro_annuale = True
            volume_number = volume
        
        # Lista di ISBN da cercare (originale e normalizzato)
        isbn_da_cercare = list(set([isbn, isbn_norm]))
        
        if is_libro_annuale and volume_number:
            # LIBRO ANNUALE: cerca nella classe corrispondente al volume in TUTTE le scuole
            classe_venditore = volume_number
            
            async for doc in db.books.find({
                "isbn": {"$in": isbn_da_cercare},
                "classe": classe_venditore
            }):
                venditori.append({
                    "codice_scuola": doc.get("codice_scuola", ""),
                    "classe_venditore": int(classe_venditore),
                    "sezione": doc.get("sezione", ""),
                    "tipo": "annuale"
                })
        else:
            # LIBRO TRIENNALE: cerca in classe 3 di TUTTE le scuole
            async for doc in db.books.find({
                "isbn": {"$in": isbn_da_cercare},
                "classe": "3"
            }):
                venditori.append({
                    "codice_scuola": doc.get("codice_scuola", ""),
                    "classe_venditore": 3,
                    "sezione": doc.get("sezione", ""),
                    "tipo": "triennale"
                })
        
        if venditori:
            # Usa ISBN normalizzato come chiave
            vendibili[isbn_norm] = venditori
    
    return vendibili


async def get_listings_count_by_isbn(
    db: AsyncIOMotorDatabase,
    isbn_list: Set[str]
) -> Dict[str, int]:
    """
    Conta quanti annunci ATTIVI (listings) esistono per ogni ISBN.
    Solo i listings con stato 'disponibile' vengono contati.
    
    Returns:
        Dict[isbn] -> numero di copie in vendita
    """
    listings_count = {}
    
    for isbn in isbn_list:
        # Conta solo listings disponibili (non venduti, non in trattativa)
        count = await db.listings.count_documents({
            "book_isbn": isbn,
            "stato": "disponibile"
        })
        listings_count[isbn] = count
    
    return listings_count


async def classifica_libri_studente(
    db: AsyncIOMotorDatabase,
    codice_scuola: str,
    classe_2025_2026: Optional[int],  # None se primo anno
    classe_2026_2027: Optional[int],  # None se ultimo anno (diplomato)
    sezione: str
) -> Dict:
    """
    Classifica automaticamente i libri di uno studente nelle 4 categorie.
    
    Args:
        db: Database MongoDB
        codice_scuola: Codice meccanografico scuola
        classe_2025_2026: Classe frequentata nel 2025/2026 (None se nuovo studente)
        classe_2026_2027: Classe che frequenterà nel 2026/2027 (None se diplomato)
        sezione: Sezione
    
    Returns:
        {
            "ancora_in_uso": [...],       # ISBN in entrambi gli anni
            "vendibili_usati": [...],     # ISBN solo nel 2025/2026
            "da_acquistare_usati": [...], # ISBN 2026/2027 disponibili usati
            "da_acquistare_nuovi": [...], # ISBN 2026/2027 non disponibili usati
        }
    """
    result = {
        "ancora_in_uso": [],
        "vendibili_usati": [],
        "da_acquistare_usati": [],
        "da_acquistare_nuovi": [],
        "fuori_corso": [],  # Libri non più richiesti da nessuna scuola
        "riepilogo": {
            "totale_ancora_in_uso": 0,
            "totale_vendibili": 0,
            "totale_da_comprare_usati": 0,
            "totale_da_comprare_nuovi": 0,
            "totale_fuori_corso": 0,
            "risparmio_stimato": 0,
            "costo_nuovi": 0,
            "costo_usati": 0,
            "costo_testi_nuovi_totale": 0,  # Somma prezzi copertina di tutti i libri da comprare (per confronto ministeriale)
            "potenziale_vendita": 0,
        }
    }
    
    # Recupera libri 2025/2026 (se esiste classe precedente)
    libri_2025 = []
    isbn_2025 = set()
    if classe_2025_2026:
        libri_2025 = await get_libri_classe_2025_2026(
            db, codice_scuola, classe_2025_2026, sezione
        )
        # Normalizza gli ISBN del 2025/2026 applicando la mappatura
        for libro in libri_2025:
            libro["isbn_originale"] = libro["isbn"]  # Salva l'originale
            libro["isbn"] = normalize_isbn(libro["isbn"])  # Applica mappatura
        isbn_2025 = {l["isbn"] for l in libri_2025}
    
    # Recupera libri 2026/2027 (se esiste classe corrente)
    libri_2026 = []
    isbn_2026 = set()
    if classe_2026_2027:
        libri_2026 = await get_libri_classe(
            db, codice_scuola, classe_2026_2027, sezione, "2026/2027"
        )
        # Normalizza anche gli ISBN del 2026/2027 applicando la mappatura
        for libro in libri_2026:
            libro["isbn_originale"] = libro["isbn"]  # Salva l'originale
            libro["isbn"] = normalize_isbn(libro["isbn"])  # Applica mappatura
        isbn_2026 = {l["isbn"] for l in libri_2026}
    
    # Mappa ISBN -> libro per accesso rapido (usa ISBN normalizzati)
    mappa_2025 = {l["isbn"]: l for l in libri_2025}
    mappa_2026 = {l["isbn"]: l for l in libri_2026}
    
    # =====================================================
    # CATEGORIA 1: ANCORA IN USO
    # ISBN presenti in ENTRAMBI gli anni
    # =====================================================
    isbn_ancora_in_uso = isbn_2025 & isbn_2026
    for isbn in isbn_ancora_in_uso:
        libro = mappa_2026.get(isbn, mappa_2025.get(isbn, {}))
        is_strumento = is_libro_strumento_musicale(libro)
        result["ancora_in_uso"].append({
            **libro,
            "categoria": "ANCORA_IN_USO",
            "motivo": "Libro usato anche quest'anno",
            "is_strumento_musicale": is_strumento,
            "escluso_dal_calcolo": is_strumento
        })
    
    # =====================================================
    # CATEGORIA 2: VENDIBILI USATI
    # ISBN in 2025/2026 MA NON in 2026/2027
    # ECCEZIONE: I libri con Volume "U" (Unico) NON sono vendibili
    #            perché coprono l'intero ciclo scolastico (es. 1-2-3 media)
    # VERIFICA: Controlla se il libro è richiesto da QUALCHE scuola
    #           Se nessuno lo richiede, non ha senso venderlo
    # =====================================================
    isbn_vendibili = isbn_2025 - isbn_2026
    
    # Verifica quali ISBN sono richiesti da almeno una scuola nel 2026/2027
    # IMPORTANTE: Cerca sia con ISBN normalizzato che originale
    isbn_con_domanda = set()
    if isbn_vendibili:
        isbn_list = list(isbn_vendibili)
        # Cerca con ISBN normalizzati
        cursor = db.adozioni.find({"isbn": {"$in": isbn_list}}, {"isbn": 1})
        async for doc in cursor:
            isbn_con_domanda.add(normalize_isbn(doc.get("isbn", "")))
        
        # Cerca anche gli ISBN originali (prima della normalizzazione)
        # per catturare casi dove adozioni usa ISBN vecchio
        isbn_originali = [mappa_2025[isbn].get("isbn_originale", isbn) for isbn in isbn_list if isbn in mappa_2025]
        if isbn_originali:
            cursor2 = db.adozioni.find({"isbn": {"$in": isbn_originali}}, {"isbn": 1})
            async for doc in cursor2:
                isbn_con_domanda.add(normalize_isbn(doc.get("isbn", "")))
    
    for isbn in isbn_vendibili:
        libro = mappa_2025[isbn]
        volume = str(libro.get("volume", "")).upper().strip()
        
        # I libri con Volume Unico (U) NON sono vendibili - servono per più anni
        # MA solo se sono ancora richiesti dalla stessa scuola/classe
        if volume == "U":
            # Verifica se il libro Volume U è ancora richiesto per questa classe
            libro_ancora_richiesto = await db.adozioni.find_one({
                "codice_scuola": codice_scuola,
                "classe": str(classe_2026_2027) if classe_2026_2027 else None,
                "isbn": isbn
            })
            
            if libro_ancora_richiesto:
                # Volume U ancora richiesto → ANCORA IN USO
                result["ancora_in_uso"].append({
                    **libro,
                    "categoria": "ANCORA_IN_USO",
                    "motivo": "Testo unico - serve per tutto il ciclo",
                    "is_volume_unico": True,
                    "is_strumento_musicale": False,
                    "escluso_dal_calcolo": False
                })
            else:
                # Volume U non più richiesto → verifica domanda generale
                if isbn in isbn_con_domanda:
                    # È richiesto da altre scuole → VENDIBILE
                    is_strumento = is_libro_strumento_musicale(libro)
                    prezzo_raw = libro.get("prezzo", 0)
                    try:
                        prezzo = float(prezzo_raw) if prezzo_raw else 0
                    except (ValueError, TypeError):
                        prezzo = 0
                    prezzo_vendita = round(prezzo * 0.5, 2)
                    
                    result["vendibili_usati"].append({
                        **libro,
                        "categoria": "VENDIBILE_USATO",
                        "prezzo_vendita_consigliato": prezzo_vendita,
                        "motivo": "Volume Unico non più richiesto dalla tua scuola",
                        "ha_domanda": True,
                        "is_strumento_musicale": is_strumento,
                        "escluso_dal_calcolo": is_strumento
                    })
                    if not is_strumento:
                        result["riepilogo"]["potenziale_vendita"] += prezzo_vendita
                else:
                    # Nessuna domanda → FUORI CORSO
                    result["fuori_corso"].append({
                        **libro,
                        "categoria": "FUORI_CORSO",
                        "motivo": "Fuori corso - Volume unico non più richiesto",
                        "ha_domanda": False,
                        "is_volume_unico": True,
                        "is_strumento_musicale": False,
                        "escluso_dal_calcolo": True
                    })
            continue  # Salta alla prossima iterazione
        
        is_strumento = is_libro_strumento_musicale(libro)
        prezzo_raw = libro.get("prezzo", 0)
        try:
            prezzo = float(prezzo_raw) if prezzo_raw else 0
        except (ValueError, TypeError):
            prezzo = 0
        prezzo_vendita = round(prezzo * 0.5, 2)
        
        # Verifica se c'è domanda per questo libro
        ha_domanda = isbn in isbn_con_domanda
        
        if ha_domanda:
            # Libro vendibile con domanda
            result["vendibili_usati"].append({
                **libro,
                "categoria": "VENDIBILE_USATO",
                "prezzo_vendita_consigliato": prezzo_vendita,
                "motivo": "Non più necessario",
                "ha_domanda": True,
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": is_strumento
            })
            # Aggiungi al potenziale vendita SOLO se NON è strumento musicale
            if not is_strumento:
                result["riepilogo"]["potenziale_vendita"] += prezzo_vendita
        else:
            # Libro FUORI CORSO - nessuna scuola lo richiede più
            result["fuori_corso"].append({
                **libro,
                "categoria": "FUORI_CORSO",
                "motivo": "Fuori corso - nessuna scuola lo richiede nel 2026/2027",
                "ha_domanda": False,
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": True  # Non contare nel potenziale vendita
            })
    
    # =====================================================
    # CATEGORIE 3 e 4: DA ACQUISTARE
    # ISBN richiesti nel 2026/2027 che NON possediamo già
    # =====================================================
    isbn_da_acquistare = isbn_2026 - isbn_2025
    
    # Verifica disponibilità usato nelle scuole di Catanzaro
    disponibilita_usato = await get_isbn_vendibili_catanzaro(db, isbn_da_acquistare)
    
    # Conta le copie REALMENTE in vendita (listings attivi)
    copie_in_vendita = await get_listings_count_by_isbn(db, isbn_da_acquistare)
    
    for isbn in isbn_da_acquistare:
        libro = mappa_2026[isbn]
        is_strumento = is_libro_strumento_musicale(libro)
        prezzo_raw = libro.get("prezzo", 0)
        # Assicura che il prezzo sia un numero
        try:
            prezzo = float(prezzo_raw) if prezzo_raw else 0
        except (ValueError, TypeError):
            prezzo = 0
        
        # Controlla se è nuova adozione (nessuno può averlo usato)
        if libro.get("nuova_adozione", False):
            # CATEGORIA 4: DA ACQUISTARE NUOVO (nuova adozione)
            result["da_acquistare_nuovi"].append({
                **libro,
                "categoria": "DA_ACQUISTARE_NUOVO",
                "motivo": "Nuova adozione - non disponibile usato",
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": is_strumento
            })
            # Aggiungi al costo SOLO se NON è strumento musicale
            if not is_strumento:
                result["riepilogo"]["costo_nuovi"] += prezzo
                result["riepilogo"]["costo_testi_nuovi_totale"] += prezzo  # Prezzo copertina per confronto ministeriale
        
        elif isbn in disponibilita_usato:
            # CATEGORIA 3: DA ACQUISTARE USATO
            venditori = disponibilita_usato[isbn]
            prezzo_usato = round(prezzo * 0.5, 2)
            # Usa il conteggio REALE delle copie in vendita (listings attivi)
            copie_reali = copie_in_vendita.get(isbn, 0)
            result["da_acquistare_usati"].append({
                **libro,
                "categoria": "DA_ACQUISTARE_USATO",
                "prezzo_usato": prezzo_usato,
                "risparmio": round(prezzo - prezzo_usato, 2),
                "venditori_disponibili": copie_reali,  # Copie REALMENTE in vendita
                "potenziali_venditori": len(venditori),  # Chi potrebbe vendere
                "motivo": f"{copie_reali} {'copia' if copie_reali == 1 else 'copie'} in vendita" if copie_reali > 0 else "Nessuna copia in vendita",
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": is_strumento
            })
            # Aggiungi al costo SOLO se NON è strumento musicale
            if not is_strumento:
                result["riepilogo"]["costo_usati"] += prezzo_usato
                result["riepilogo"]["costo_testi_nuovi_totale"] += prezzo  # Prezzo copertina per confronto ministeriale
                result["riepilogo"]["risparmio_stimato"] += round(prezzo - prezzo_usato, 2)
        
        else:
            # CATEGORIA 4: DA ACQUISTARE NUOVO (non disponibile usato)
            result["da_acquistare_nuovi"].append({
                **libro,
                "categoria": "DA_ACQUISTARE_NUOVO",
                "motivo": "Non disponibile usato nelle scuole di Catanzaro",
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": is_strumento
            })
            # Aggiungi al costo SOLO se NON è strumento musicale
            if not is_strumento:
                result["riepilogo"]["costo_nuovi"] += prezzo
                result["riepilogo"]["costo_testi_nuovi_totale"] += prezzo  # Prezzo copertina per confronto ministeriale
    
    # Aggiorna conteggi
    result["riepilogo"]["totale_ancora_in_uso"] = len(result["ancora_in_uso"])
    result["riepilogo"]["totale_vendibili"] = len(result["vendibili_usati"])
    result["riepilogo"]["totale_da_comprare_usati"] = len(result["da_acquistare_usati"])
    result["riepilogo"]["totale_da_comprare_nuovi"] = len(result["da_acquistare_nuovi"])
    result["riepilogo"]["totale_fuori_corso"] = len(result["fuori_corso"])
    
    # Conta libri strumento esclusi
    strumenti_esclusi = sum(1 for l in result["da_acquistare_usati"] + result["da_acquistare_nuovi"] if l.get("is_strumento_musicale"))
    result["riepilogo"]["libri_strumento_esclusi"] = strumenti_esclusi
    
    return result


def calcola_classe_precedente(classe_attuale: int, tipo_scuola: str) -> Optional[int]:
    """
    Calcola la classe frequentata nel 2025/2026 in base alla classe 2026/2027.
    
    Returns:
        None se è il primo anno del ciclo (nuovo studente)
    """
    if tipo_scuola == "primo_grado":
        # Scuola media: 1, 2, 3
        if classe_attuale == 1:
            return None  # Nuovo studente
        return classe_attuale - 1
    else:
        # Scuola superiore: 1, 2, 3, 4, 5
        if classe_attuale == 1:
            return None  # Nuovo studente
        return classe_attuale - 1


def calcola_classe_successiva(classe_attuale: int, tipo_scuola: str) -> Optional[int]:
    """
    Calcola la classe che frequenterà nel prossimo anno.
    
    Returns:
        None se è l'ultimo anno del ciclo (diplomando)
    """
    if tipo_scuola == "primo_grado":
        # Scuola media: 1, 2, 3
        if classe_attuale >= 3:
            return None  # Diploma
        return classe_attuale + 1
    else:
        # Scuola superiore: 1, 2, 3, 4, 5
        if classe_attuale >= 5:
            return None  # Diploma
        return classe_attuale + 1
