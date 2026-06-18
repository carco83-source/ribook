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
    # Scegli collezione
    if anno_scolastico == "2025/2026":
        collection = db.adozioni_2025_2026
    else:
        collection = db.adozioni
    
    classe_str = str(classe)
    sezione_upper = sezione.upper() if sezione else "A"
    
    # Prima prova con sezione esatta
    libri = await collection.find({
        "codice_scuola": codice_scuola,
        "anno_corso": classe_str,
        "sezione": sezione_upper
    }).to_list(None)
    
    # Fallback: qualsiasi sezione
    if not libri:
        libri = await collection.find({
            "codice_scuola": codice_scuola,
            "anno_corso": classe_str
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
    Recupera libri dalla collezione 2025/2026.
    NOTA: La struttura è diversa - documenti aggregati per classe con array 'libri'.
    """
    collection = db.adozioni_2025_2026
    classe_int = int(classe)
    sezione_upper = sezione.upper() if sezione else "A"
    
    # Cerca documento aggregato
    doc = await collection.find_one({
        "codice_scuola": codice_scuola,
        "classe": classe_int,
        "sezione": sezione_upper
    })
    
    # Fallback senza sezione
    if not doc:
        doc = await collection.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe_int
        })
    
    if not doc:
        return []
    
    # Estrai libri dall'array
    libri_raw = doc.get("libri", [])
    
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
    } for l in libri_raw if l.get("isbn")]


async def get_isbn_vendibili_catanzaro(
    db: AsyncIOMotorDatabase,
    isbn_richiesti: Set[str]
) -> Dict[str, List[Dict]]:
    """
    Per ogni ISBN richiesto, verifica se è disponibile come "vendibile usato"
    da qualche studente delle scuole di Catanzaro.
    
    Un ISBN è vendibile se:
    - Era nella classe 2025/2026 di qualcuno
    - NON è nella classe 2026/2027 di quella persona
    
    In pratica: cerca in adozioni_2025_2026 ma NON in adozioni per la classe successiva.
    
    Returns:
        Dict[isbn] -> Lista di info venditori (scuola, classe, etc.)
    """
    vendibili = {}
    
    # Per ogni scuola di Catanzaro, verifica quali ISBN sono vendibili
    # Un libro è vendibile se era in uso l'anno scorso ma non quest'anno
    
    # Scuole di Catanzaro (codici che iniziano con CZ)
    scuole_cz = await db.adozioni.distinct("codice_scuola")
    scuole_cz = [s for s in scuole_cz if s and s.startswith("CZ")]
    
    for isbn in isbn_richiesti:
        venditori = []
        
        # Cerca in quali classi 2025/2026 c'era questo libro
        async for doc in db.adozioni_2025_2026.find({"libri.isbn": isbn}):
            codice_scuola = doc.get("codice_scuola", "")
            classe_passata = doc.get("classe", 0)
            sezione = doc.get("sezione", "")
            
            # Calcola la classe successiva (2026/2027)
            classe_attuale = classe_passata + 1
            
            # Verifica se lo stesso ISBN è ancora richiesto nella classe successiva
            libro_ancora_in_uso = await db.adozioni.find_one({
                "codice_scuola": codice_scuola,
                "anno_corso": str(classe_attuale),
                "isbn": isbn
            })
            
            if not libro_ancora_in_uso:
                # Il libro NON serve più → è VENDIBILE
                venditori.append({
                    "codice_scuola": codice_scuola,
                    "classe_venditore": classe_attuale,  # Chi era in classe_passata ora è in classe_attuale
                    "sezione": sezione,
                })
        
        if venditori:
            vendibili[isbn] = venditori
    
    return vendibili


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
        "riepilogo": {
            "totale_ancora_in_uso": 0,
            "totale_vendibili": 0,
            "totale_da_comprare_usati": 0,
            "totale_da_comprare_nuovi": 0,
            "risparmio_stimato": 0,
            "costo_nuovi": 0,
            "costo_usati": 0,
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
        isbn_2025 = {l["isbn"] for l in libri_2025}
    
    # Recupera libri 2026/2027 (se esiste classe corrente)
    libri_2026 = []
    isbn_2026 = set()
    if classe_2026_2027:
        libri_2026 = await get_libri_classe(
            db, codice_scuola, classe_2026_2027, sezione, "2026/2027"
        )
        isbn_2026 = {l["isbn"] for l in libri_2026}
    
    # Mappa ISBN -> libro per accesso rapido
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
    isbn_con_domanda = set()
    if isbn_vendibili:
        # Query per trovare quali ISBN sono richiesti
        isbn_list = list(isbn_vendibili)
        cursor = db.adozioni.find({"isbn": {"$in": isbn_list}}, {"isbn": 1})
        async for doc in cursor:
            isbn_con_domanda.add(doc.get("isbn"))
    
    for isbn in isbn_vendibili:
        libro = mappa_2025[isbn]
        volume = str(libro.get("volume", "")).upper().strip()
        
        # I libri con Volume Unico (U) NON sono vendibili - servono per più anni
        # Quindi li spostiamo in "ancora_in_uso" invece che "vendibili"
        if volume == "U":
            result["ancora_in_uso"].append({
                **libro,
                "categoria": "ANCORA_IN_USO",
                "motivo": "Testo unico - serve per tutto il ciclo",
                "is_volume_unico": True,
                "is_strumento_musicale": False,
                "escluso_dal_calcolo": False
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
            # Libro non vendibile - nessuna scuola lo richiede
            result["ancora_in_uso"].append({
                **libro,
                "categoria": "NON_VENDIBILE",
                "motivo": "Nessuna scuola lo richiede nel 2026/2027",
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
        
        elif isbn in disponibilita_usato:
            # CATEGORIA 3: DA ACQUISTARE USATO
            venditori = disponibilita_usato[isbn]
            prezzo_usato = round(prezzo * 0.5, 2)
            result["da_acquistare_usati"].append({
                **libro,
                "categoria": "DA_ACQUISTARE_USATO",
                "prezzo_usato": prezzo_usato,
                "risparmio": round(prezzo - prezzo_usato, 2),
                "venditori_disponibili": len(venditori),
                "motivo": f"Disponibile usato da {len(venditori)} studenti",
                "is_strumento_musicale": is_strumento,
                "escluso_dal_calcolo": is_strumento
            })
            # Aggiungi al costo SOLO se NON è strumento musicale
            if not is_strumento:
                result["riepilogo"]["costo_usati"] += prezzo_usato
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
    
    # Aggiorna conteggi
    result["riepilogo"]["totale_ancora_in_uso"] = len(result["ancora_in_uso"])
    result["riepilogo"]["totale_vendibili"] = len(result["vendibili_usati"])
    result["riepilogo"]["totale_da_comprare_usati"] = len(result["da_acquistare_usati"])
    result["riepilogo"]["totale_da_comprare_nuovi"] = len(result["da_acquistare_nuovi"])
    
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
