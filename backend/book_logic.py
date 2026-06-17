"""
Logica di classificazione libri per acquisto e vendita

STRUTTURA CICLI:
- MEDIE (8 scuole): Triennio unico (1°-2°-3°)
  - Volumi annuali: 1, 2, 3
  - Volumi unici: triennali

- SUPERIORI (13 scuole):
  - BIENNIO (1°-2°): Volumi annuali 1, 2 | Volumi unici biennali
  - TRIENNIO (3°-4°-5°): Volumi annuali 1, 2, 3 | Volumi unici triennali

USO ISBN:
- USA ISBN: per tutto (volumi unici, acquisti, copie disponibili)
- NON USA ISBN: solo per determinare se un libro ANNUALE è VENDIBILE
  (le edizioni cambiano da un anno all'altro, l'ISBN cambia)

REGOLA ANNO PUBBLICAZIONE:
- Volumi UNICI con anno_pubblicazione >= 2023 → NUOVO (primo ciclo)
- Libri ANNUALI con anno_pubblicazione >= 2024 → NUOVO (troppo recente)

LOGICA ACQUISTO:
- nuova_adozione=TRUE → NUOVO
- da_acquistare=NO + consigliato_raw=NO/SI → GIÀ POSSEDUTO
- da_acquistare=SI → DA ACQUISTARE (verifica USATO/NUOVO con ISBN)

LOGICA VENDITA:
- VOLUMI UNICI: cerca stesso ISBN nelle classi precedenti
- LIBRI ANNUALI: cerca stessa MATERIA (non ISBN) nelle classi precedenti
"""

import re
from typing import Optional, Tuple, List, Dict, Any


def get_ciclo_info(tipo_scuola: str, classe: int) -> dict:
    """
    Restituisce informazioni sul ciclo scolastico
    
    Returns:
        dict con:
        - ciclo: 'triennio_medie', 'biennio', 'triennio_superiori'
        - classe_min: classe minima del ciclo
        - classe_max: classe massima del ciclo
        - classi_precedenti: lista classi a cui vendere
        - classe_successiva: classe che può vendere a questa
    """
    if tipo_scuola == "primo_grado":  # MEDIE
        return {
            "ciclo": "triennio_medie",
            "classe_min": 1,
            "classe_max": 3,
            "classi_precedenti": list(range(1, classe)),  # [1] per 2°, [1,2] per 3°
            "classe_successiva": classe + 1 if classe < 3 else None
        }
    else:  # SUPERIORI
        if classe <= 2:  # BIENNIO
            return {
                "ciclo": "biennio",
                "classe_min": 1,
                "classe_max": 2,
                "classi_precedenti": [1] if classe == 2 else [],
                "classe_successiva": classe + 1 if classe < 2 else 3  # 2° passa a 3° (nuovo ciclo)
            }
        else:  # TRIENNIO
            return {
                "ciclo": "triennio_superiori",
                "classe_min": 3,
                "classe_max": 5,
                "classi_precedenti": list(range(3, classe)),  # [3] per 4°, [3,4] per 5°
                "classe_successiva": classe + 1 if classe < 5 else None
            }


def estrai_nome_base_libro(titolo: str) -> str:
    """
    Rimuove indicatori di volume dal titolo per confronto
    
    Es: "STORIA VOL.1" → "STORIA"
        "MATEMATICA 1" → "MATEMATICA"
        "FISICA VOLUME 1" → "FISICA"
    """
    if not titolo:
        return ""
    
    titolo_upper = titolo.upper()
    
    # Rimuovi pattern comuni di volume
    patterns = [
        r'\s*VOL\.?\s*\d+',       # VOL.1, VOL 1, VOL1
        r'\s*VOLUME\s*\d+',        # VOLUME 1
        r'\s+\d+\s*$',             # " 1" alla fine
        r'\s*-\s*\d+\s*$',         # " - 1" alla fine
        r'\s*\(\d+\)\s*$',         # "(1)" alla fine
    ]
    
    for pattern in patterns:
        titolo_upper = re.sub(pattern, '', titolo_upper)
    
    return titolo_upper.strip()


def estrai_numero_volume(titolo: str, volume_field: str) -> Optional[int]:
    """
    Estrae il numero di volume da titolo o campo volume
    
    Returns:
        int se trovato, None altrimenti
    """
    # Prima controlla il campo volume
    if volume_field:
        if volume_field.upper() == 'U':
            return None  # Volume unico
        try:
            return int(volume_field)
        except:
            pass
    
    # Cerca nel titolo
    patterns = [
        r'VOL\.?\s*(\d+)',
        r'VOLUME\s*(\d+)',
        r'\s+(\d+)\s*$',
        r'-\s*(\d+)\s*$',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, titolo.upper())
        if match:
            try:
                return int(match.group(1))
            except:
                pass
    
    return None


def is_stesso_libro_volume_diverso(libro1: dict, libro2: dict) -> Tuple[bool, Optional[int], Optional[int]]:
    """
    Verifica se due libri sono volumi diversi della stessa serie
    
    Returns:
        (is_same_series, vol1, vol2)
    """
    # Stesso editore?
    editore1 = libro1.get('editore', '').upper().strip()
    editore2 = libro2.get('editore', '').upper().strip()
    
    if editore1 != editore2:
        return False, None, None
    
    # Stesso autore? (almeno le prime parole)
    autori1 = libro1.get('autori', '').upper().strip()[:20]
    autori2 = libro2.get('autori', '').upper().strip()[:20]
    
    if autori1 and autori2 and autori1[:10] != autori2[:10]:
        return False, None, None
    
    # Stesso titolo base?
    nome_base1 = estrai_nome_base_libro(libro1.get('titolo', ''))
    nome_base2 = estrai_nome_base_libro(libro2.get('titolo', ''))
    
    if nome_base1 != nome_base2:
        return False, None, None
    
    # Estrai numeri volume
    vol1 = estrai_numero_volume(libro1.get('titolo', ''), libro1.get('volume', ''))
    vol2 = estrai_numero_volume(libro2.get('titolo', ''), libro2.get('volume', ''))
    
    return True, vol1, vol2


def trova_volume_successivo(libro: dict, libri_classe_succ: List[dict]) -> Optional[dict]:
    """
    Cerca il volume successivo di un libro nella classe successiva
    
    Es: cerca Vol.2 quando ho Vol.1
    """
    for libro_succ in libri_classe_succ:
        is_same, vol_attuale, vol_succ = is_stesso_libro_volume_diverso(libro, libro_succ)
        
        if is_same and vol_attuale is not None and vol_succ is not None:
            if vol_succ == vol_attuale + 1:
                return libro_succ
    
    return None


# Codici delle 21 scuole del COMUNE di Catanzaro
SCUOLE_MEDIE_CATANZARO = [
    'CZMM86001P',  # I.C. Casalinuovo
    'CZMM856013',  # I.C. Don Milani
    'CZMM85201Q',  # I.C. Patari - Rodari
    'CZMM86701D',  # I.C. Vivaldi
    'CZMM85801P',  # I.C. Mater Domini (Lampasi)
    'CZMM00300E',  # Convitto Nazionale Galluppi
    'CZMM83903B',  # I.C. G. Sabatini (Caraffa)
    'CZ1MBR5002',  # Scuola Maria Immacolata
]

SCUOLE_SUPERIORI_CATANZARO = [
    'CZPC09000X',  # Liceo Classico P. Galluppi
    'CZPS00101C',  # Liceo Scientifico E. Fermi
    'CZPS02201D',  # Liceo Scientifico L. Siciliani
    'CZSL02201A',  # Liceo Artistico di Catanzaro
    'CZPM02201E',  # Liceo Linguistico G. De Nobili
    'CZPM00101D',  # Liceo Magistrale Fermi
    'CZTF010008',  # ITIS E. Scalfaro
    'CZTD024011',  # ITCG Grimaldi - Pacioli
    'CZTA021035',  # IST. Tecnico Agrario V. Emanuele II
    'CZTE021011',  # IST. Tecnico B. Chimirri
    'CZRI02401A',  # IPSIA G. Ferraris
    'CZRC02401N',  # IPSCT Sorace Maresca
    'CZTL02401B',  # IIS Petrucci-Ferraris-Maresca
]


async def get_scuole_catanzaro(db, tipo_scuola: str) -> List[str]:
    """
    Restituisce i codici delle scuole del COMUNE di Catanzaro per tipo
    
    Args:
        tipo_scuola: 'primo_grado' (8 medie) o 'secondo_grado' (13 superiori)
    
    Returns:
        Lista di codici scuola del comune di Catanzaro
    """
    if tipo_scuola == "primo_grado":
        return SCUOLE_MEDIE_CATANZARO
    else:
        return SCUOLE_SUPERIORI_CATANZARO


async def libro_in_classe(db, isbn: str, codice_scuola: str, classe: int, 
                          anno: str = "2025/2026") -> Optional[dict]:
    """
    Verifica se un ISBN è presente in una specifica classe/scuola
    
    Args:
        anno: "2025/2026" per anno precedente, "2024/2025" per storico, "2026/2027" per corrente
    
    Returns:
        Il libro se trovato, None altrimenti
    """
    # CORREZIONE: Mappa anno scolastico alla collezione corretta
    if anno == "2026/2027":
        collection = "adozioni"  # Anno corrente
    elif anno == "2025/2026":
        collection = "adozioni_2025_2026"  # Anno precedente
    else:
        collection = "adozioni_2024_2025"  # Storico
    
    # La collezione 2025/2026 ha struttura: {codice_scuola, classe: int, libri: [...]}
    # La collezione 2026/2027 ha struttura: {codice_scuola, anno_corso: str, ...}
    
    if collection == "adozioni":
        # Nuova struttura: ogni documento è un libro singolo
        libro = await db[collection].find_one({
            "codice_scuola": codice_scuola,
            "anno_corso": str(classe),
            "isbn": isbn
        })
        return libro
    else:
        # Vecchia struttura: documento con array di libri
        adozione = await db[collection].find_one({
            "codice_scuola": codice_scuola,
            "classe": classe
        })
        
        if adozione:
            for libro in adozione.get('libri', []):
                if libro.get('isbn') == isbn:
                    return libro
    
    return None


async def cerca_isbn_in_classi(db, isbn: str, tipo_scuola: str, classi: List[int],
                               anno: str = "2025/2026", 
                               escludi_scuola: str = None) -> List[dict]:
    """
    Cerca un ISBN in tutte le scuole di Catanzaro per specifiche classi
    
    Returns:
        Lista di {scuola, classe, libro} dove è stato trovato
    """
    collection = "adozioni" if anno == "2025/2026" else "adozioni_2024_2025"
    risultati = []
    
    query = {
        "tipo_scuola": tipo_scuola,
        "classe": {"$in": classi},
        "libri.isbn": isbn
    }
    
    if escludi_scuola:
        query["codice_scuola"] = {"$ne": escludi_scuola}
    
    async for adozione in db[collection].find(query):
        for libro in adozione.get('libri', []):
            if libro.get('isbn') == isbn:
                risultati.append({
                    "codice_scuola": adozione.get('codice_scuola'),
                    "classe": adozione.get('classe'),
                    "libro": libro
                })
                break
    
    return risultati


async def cerca_seguito_volume(db, libro: dict, tipo_scuola: str, classe_succ: int,
                               anno: str = "2025/2026") -> List[dict]:
    """
    Cerca il volume successivo in tutte le scuole di Catanzaro
    
    Returns:
        Lista di {scuola, classe, libro_seguito} dove è stato trovato
    """
    collection = "adozioni" if anno == "2025/2026" else "adozioni_2024_2025"
    risultati = []
    
    async for adozione in db[collection].find({
        "tipo_scuola": tipo_scuola,
        "classe": classe_succ
    }):
        for libro_succ in adozione.get('libri', []):
            is_same, vol_attuale, vol_succ = is_stesso_libro_volume_diverso(libro, libro_succ)
            
            if is_same and vol_attuale is not None and vol_succ is not None:
                if vol_succ == vol_attuale + 1:
                    risultati.append({
                        "codice_scuola": adozione.get('codice_scuola'),
                        "classe": adozione.get('classe'),
                        "libro_seguito": libro_succ
                    })
                    break
    
    return risultati


async def calcola_stato_acquisto(db, libro: dict, classe: int, tipo_scuola: str,
                                  codice_scuola: str, sezione: str = None) -> Tuple[str, str, int]:
    """
    Calcola lo stato di acquisto di un libro
    
    ============================================================
    LOGICA SCUOLE MEDIE (primo_grado) - SEMPLIFICATA:
    ============================================================
    - TUTTI i VOLUMI UNICI si comprano SOLO in 1ª media e durano 3 anni
    - Indipendentemente da da_acquistare o consigliato_raw
    - In 2ª e 3ª si comprano SOLO i libri ANNUALI
    - Gli ANNUALI possono essere comprati USATI o NUOVI
    
    ============================================================
    LOGICA SCUOLE SUPERIORI (secondo_grado) - COMPLESSA:
    ============================================================
    - Biennio (1-2) e Triennio (3-4-5) separati
    - consigliato_raw='AP' significa da acquistare
    - Volumi unici durano per il ciclo (2 anni biennio, 3 anni triennio)
    
    ============================================================
    REGOLA ANNO PUBBLICAZIONE:
    ============================================================
    - Se anno_pubblicazione >= 2024 → NUOVO (edizione troppo recente)
    - Non può esistere usato perché nessuno lo ha ancora posseduto
    
    Returns:
        (stato, motivo, copie_disponibili)
        stato: "NUOVO", "USATO", "GIA_POSSEDUTO"
    """
    isbn = libro.get('isbn', '')
    nuova_adozione = libro.get('nuova_adozione', False)
    da_acquistare = libro.get('da_acquistare', True)
    consigliato_raw = libro.get('consigliato_raw', 'NO').upper()
    is_volume_unico = libro.get('is_volume_unico', False)
    anno_pubblicazione = libro.get('anno_pubblicazione')
    
    # ============================================================
    # REGOLA 0 GLOBALE: ANNO PUBBLICAZIONE >= 2023 → NUOVO
    # Edizione troppo recente, non può esistere usato
    # Per volumi unici: 2023 è il primo anno di utilizzo
    # Per annuali: 2024+ è troppo recente
    # ATTENZIONE: Per volumi unici, questa regola si applica SOLO in 1ª classe
    # Perché in 2ª/3ª lo studente ha già comprato il libro in 1ª
    # ============================================================
    if anno_pubblicazione:
        # Volumi unici pubblicati dal 2023 non possono essere usati (primo ciclo)
        # MA questa regola si applica SOLO se siamo in 1ª classe!
        # In 2ª/3ª media, lo studente ha GIÀ comprato il libro in 1ª
        if is_volume_unico and anno_pubblicazione >= 2023 and classe == 1:
            return ("NUOVO", f"Edizione {anno_pubblicazione} - primo ciclo, no usato", 0)
        # Libri annuali pubblicati dal 2024 non possono essere usati
        if not is_volume_unico and anno_pubblicazione >= 2024:
            return ("NUOVO", f"Edizione {anno_pubblicazione} - troppo recente per usato", 0)
    
    # Conta copie disponibili per questo ISBN
    copie = await db.listings.count_documents({
        "book_isbn": isbn,
        "status": "available"
    })
    
    # ============================================================
    # SCUOLA MEDIA (primo_grado) - LOGICA CORRETTA
    # ============================================================
    # REGOLA: il campo "volume" determina quando comprare:
    # - Volume = U → Triennale → compra in 1ª, già posseduto in 2ª/3ª
    # - Volume = 1 → Annuale → compra in 1ª
    # - Volume = 2 → Annuale → compra in 2ª
    # - Volume = 3 → Annuale → compra in 3ª
    # INDIPENDENTEMENTE da da_acquistare!
    #
    # METODO per determinare USATO:
    # 1. Guarda nella classe SUCCESSIVA dello STESSO ANNO (2026/2027)
    #    Se in 2ª c'è Vol.2, allora Vol.1 in 1ª esisteva già → USATO
    # 2. Per i triennali: se in 2ª/3ª c'è lo stesso Vol.U → USATO
    # 3. Fallback: cerca in 2025/2026 per casi speciali (4° anno medie)
    # ============================================================
    if tipo_scuola == "primo_grado":
        
        # Determina se è volume unico dal campo "volume"
        volume_field = libro.get('volume', '').upper().strip()
        is_triennale = volume_field == 'U' or is_volume_unico
        
        # Estrai numero volume per libri annuali
        numero_volume = None
        if volume_field and volume_field != 'U':
            try:
                numero_volume = int(volume_field)
            except:
                pass
        
        # Helper: cerca libro nella classe successiva dello stesso anno (2026/2027)
        async def libro_in_classe_corrente(db, titolo_base, codice_scuola, classe_target):
            """Cerca se esiste lo stesso libro (per titolo) nella classe target 2026/2027"""
            import re
            
            # Estrai il titolo base (rimuovi VOLUME, CONFEZIONE, LEVEL, parentesi, etc.)
            def estrai_titolo_base(titolo):
                # Rimuovi VOLUME X, VOL X, LEVEL X, CONFEZIONE
                titolo = re.sub(r'\s*[-+]?\s*(VOLUME|VOL\.?|CONFEZIONE|LEVEL)\s*\d+.*$', '', titolo, flags=re.IGNORECASE)
                titolo = re.sub(r'\s*[-+]?\s*(VOLUME|VOL\.?)\s*U.*$', '', titolo, flags=re.IGNORECASE)
                titolo = re.sub(r'\s*\(.*\).*$', '', titolo)  # Rimuovi parentesi
                titolo = re.sub(r'\s*[-+].*$', '', titolo)  # Rimuovi dopo - o +
                # Rimuovi "X° ED." dove X è un numero
                titolo = re.sub(r'\s*\d+°?\s*ED\.?.*$', '', titolo, flags=re.IGNORECASE)
                return titolo.strip()
            
            titolo_clean = estrai_titolo_base(titolo_base)
            
            # Se il titolo è troppo corto, usa i primi 15 caratteri dell'originale
            if len(titolo_clean) < 5:
                titolo_clean = titolo_base[:15]
            
            # Cerca in adozioni 2026/2027
            libro_trovato = await db.adozioni.find_one({
                "codice_scuola": codice_scuola,
                "anno_corso": str(classe_target),
                "titolo": {"$regex": f"^{re.escape(titolo_clean)}", "$options": "i"}
            })
            return libro_trovato
        
        # ----------------------------------------------------------
        # VOLUMI TRIENNALI (U): si comprano SOLO in 1ª, durano 3 anni
        # USATO: solo se stesso ISBN era in 3ª del 2025/2026
        # Chi era in 2ª l'anno scorso (ora 3ª) deve TENERLO ancora!
        # ----------------------------------------------------------
        if is_triennale:
            if classe == 1:
                # 1ª MEDIA: deve comprare il volume unico
                
                # Se ci sono copie caricate con QUESTO ISBN → USATO
                if copie > 0:
                    return ("USATO", f"{copie} copie disponibili", copie)
                
                # USATO solo se stesso ISBN era in 3ª del 2025/2026
                # Cerca in TUTTE le scuole del 2025/2026 (non solo quelle di Catanzaro)
                async for adozione in db.adozioni_2025_2026.find({"classe": 3}):
                    for l in adozione.get('libri', []):
                        if l.get('isbn') == isbn:
                            return ("USATO", "Triennale - ex 3ª possono vendere", 0)
                
                # Non trovato in 3ª 2025/2026 → NUOVO (nuova adozione o non ancora al 4° anno)
                return ("NUOVO", "Volume triennale - nuova adozione", 0)
            
            else:
                # 2ª o 3ª MEDIA: volume triennale GIÀ POSSEDUTO (comprato in 1ª)
                return ("GIA_POSSEDUTO", "Volume triennale (comprato in 1ª)", 0)
        
        # ----------------------------------------------------------
        # LIBRI ANNUALI: Volume 1 in 1ª, Volume 2 in 2ª, Volume 3 in 3ª
        # INDIPENDENTEMENTE da da_acquistare!
        # ----------------------------------------------------------
        else:
            # Determina in quale classe va comprato questo volume
            classe_acquisto = numero_volume if numero_volume else classe
            
            # Se siamo nella classe giusta per questo volume → DA COMPRARE
            if classe == classe_acquisto or numero_volume is None:
                
                # Se ci sono copie caricate → USATO
                if copie > 0:
                    return ("USATO", f"{copie} copie disponibili", copie)
                
                # METODO PRINCIPALE: guarda nella classe SUCCESSIVA dello STESSO ANNO
                # Es: Vol.1 in 1ª → se in 2ª c'è Vol.2 dello stesso libro → USATO
                # Perché chi era in 1ª l'anno scorso (ora in 2ª) può vendere il Vol.1
                titolo = libro.get('titolo', '')
                classe_succ = classe + 1
                
                if classe_succ <= 3:
                    libro_classe_succ = await libro_in_classe_corrente(db, titolo, codice_scuola, classe_succ)
                    if libro_classe_succ:
                        # Il volume successivo esiste → chi è in classe_succ può vendere il volume precedente
                        return ("USATO", f"Chi è in {classe_succ}ª può vendere Vol.{numero_volume or classe}", 0)
                
                # Cross-scuola
                scuole = await get_scuole_catanzaro(db, tipo_scuola)
                for altra_scuola in scuole:
                    if altra_scuola != codice_scuola and classe_succ <= 3:
                        libro_altra = await libro_in_classe_corrente(db, titolo, altra_scuola, classe_succ)
                        if libro_altra:
                            return ("USATO", "Disponibile da altra scuola", 0)
                
                # Fallback: cerca in 2025/2026 (per ISBN esatto)
                libro_anno_scorso = await libro_in_classe(db, isbn, codice_scuola, classe, "2025/2026")
                if libro_anno_scorso:
                    return ("USATO", f"Ex {classe}ª (ora {classe_succ}ª) possono venderlo", 0)
                
                return ("NUOVO", f"Vol.{numero_volume or classe} - nuova adozione", 0)
            
            else:
                # Siamo in una classe diversa da quella del volume
                if classe > classe_acquisto:
                    return ("GIA_POSSEDUTO", f"Vol.{numero_volume} (comprato in {classe_acquisto}ª)", 0)
                else:
                    return ("GIA_POSSEDUTO", f"Vol.{numero_volume} non richiesto in {classe}ª", 0)
    
    # ============================================================
    # SCUOLA SUPERIORE (secondo_grado) - LOGICA CORRETTA
    # ============================================================
    # REGOLE:
    # 1. PRIMO ANNO (solo 1ª): TUTTI i libri vanno comprati
    # 2. ANNI SUCCESSIVI (2ª, 3ª, 4ª, 5ª):
    #    - da_acquistare = SI → DA COMPRARE
    #    - da_acquistare = NO + consigliato = SI → DA COMPRARE (trucco scuole)
    #    - da_acquistare = NO + consigliato = NO → GIÀ POSSEDUTO
    # 3. ANNUALI (Volume 1, 2, 3): 
    #    - Biennio: Vol.1 → 1ª, Vol.2 → 2ª
    #    - Triennio: Vol.1 → 3ª, Vol.2 → 4ª, Vol.3 → 5ª
    # ============================================================
    else:
        ciclo_info = get_ciclo_info(tipo_scuola, classe)
        classe_min_ciclo = ciclo_info.get('classe_min', 1)
        classe_max_ciclo = ciclo_info.get('classe_max', 5)
        
        # Determina se è volume unico o annuale dal campo "volume"
        volume_field = libro.get('volume', '').upper().strip()
        is_unico = volume_field == 'U' or is_volume_unico
        
        # Estrai numero volume per libri annuali
        numero_volume = None
        if volume_field and volume_field != 'U':
            try:
                numero_volume = int(volume_field)
            except:
                pass
        
        # Helper: cerca libro nella classe successiva dello stesso anno
        async def libro_in_classe_corrente_sup(db, titolo_base, codice_scuola, classe_target):
            import re
            def estrai_titolo_base(titolo):
                titolo = re.sub(r'\s*[-+]?\s*(VOLUME|VOL\.?|CONFEZIONE|LEVEL)\s*\d+.*$', '', titolo, flags=re.IGNORECASE)
                titolo = re.sub(r'\s*[-+]?\s*(VOLUME|VOL\.?)\s*U.*$', '', titolo, flags=re.IGNORECASE)
                titolo = re.sub(r'\s*\(.*\).*$', '', titolo)
                titolo = re.sub(r'\s*[-+].*$', '', titolo)
                titolo = re.sub(r'\s*\d+°?\s*ED\.?.*$', '', titolo, flags=re.IGNORECASE)
                return titolo.strip()
            
            titolo_clean = estrai_titolo_base(titolo_base)
            if len(titolo_clean) < 5:
                titolo_clean = titolo_base[:15]
            
            libro_trovato = await db.adozioni.find_one({
                "codice_scuola": codice_scuola,
                "anno_corso": str(classe_target),
                "titolo": {"$regex": f"^{re.escape(titolo_clean)}", "$options": "i"}
            })
            return libro_trovato
        
        # ----------------------------------------------------------
        # LIBRI ANNUALI (Volume 1, 2, 3 o 3, 4, 5) - Stessa logica delle medie
        # ----------------------------------------------------------
        if numero_volume is not None:
            # Calcola in quale classe va comprato questo volume
            # Biennio (classi 1-2): Vol.1 → 1ª, Vol.2 → 2ª
            # Triennio (classi 3-5): 
            #   - Vol.1, Vol.2, Vol.3 → 3ª, 4ª, 5ª
            #   - Vol.3, Vol.4, Vol.5 → 3ª, 4ª, 5ª
            
            if classe <= 2:
                # Biennio: Vol.1 → 1ª, Vol.2 → 2ª
                classe_acquisto = numero_volume
            else:
                # Triennio
                if numero_volume >= 3:
                    # Vol.3 → 3ª, Vol.4 → 4ª, Vol.5 → 5ª
                    classe_acquisto = numero_volume
                else:
                    # Vol.1 → 3ª, Vol.2 → 4ª, Vol.3 → 5ª
                    classe_acquisto = 2 + numero_volume  # 1+2=3, 2+2=4, 3+2=5
            
            if classe == classe_acquisto:
                # Siamo nella classe giusta per questo volume → DA COMPRARE
                if copie > 0:
                    return ("USATO", f"{copie} copie disponibili", copie)
                
                # Cerca se nella classe successiva (stesso anno) c'è il volume successivo
                titolo = libro.get('titolo', '')
                classe_succ = classe + 1
                
                if classe_succ <= 5:
                    libro_classe_succ = await libro_in_classe_corrente_sup(db, titolo, codice_scuola, classe_succ)
                    if libro_classe_succ:
                        return ("USATO", f"Chi è in {classe_succ}ª può vendere Vol.{numero_volume}", 0)
                
                # Fallback: cerca in 2025/2026
                libro_anno_scorso = await libro_in_classe(db, isbn, codice_scuola, classe, "2025/2026")
                if libro_anno_scorso:
                    return ("USATO", f"Ex {classe}ª possono venderlo", 0)
                
                return ("NUOVO", f"Vol.{numero_volume} - nuova adozione", 0)
            
            elif classe > classe_acquisto:
                return ("GIA_POSSEDUTO", f"Vol.{numero_volume} (comprato in {classe_acquisto}ª)", 0)
            else:
                return ("GIA_POSSEDUTO", f"Vol.{numero_volume} non richiesto in {classe}ª", 0)
        
        # ----------------------------------------------------------
        # PRIMO ANNO (1ª): Rispetta da_acquistare e consigliato
        # da_acquistare=False significa NON COMPRARE (incluso in altro libro o facoltativo)
        # ----------------------------------------------------------
        if classe == 1:
            # PRIMA verifica se il libro va comprato
            # Consigliato = SI significa che va comprato (trucco scuole)
            consigliato_bool = consigliato_raw and consigliato_raw.upper() not in ['NO', 'N', '']
            deve_comprare = da_acquistare or consigliato_bool
            
            if not deve_comprare:
                # da_acquistare = NO e consigliato = NO → NON RICHIESTO (incluso in altro o facoltativo)
                # Per 1ª NON può essere "GIA_POSSEDUTO" perché è il primo anno!
                return ("NON_RICHIESTO", "Non da acquistare (incluso o facoltativo)", 0)
            
            # Se deve comprare, cerca usato
            if copie > 0:
                return ("USATO", f"{copie} copie disponibili", copie)
            
            # Per libri UNICI: cerca se in 2ª dello scorso anno c'era lo stesso libro
            # Se c'era, gli ex 2ª possono venderlo
            if is_unico:
                # Cerca nel 2025/2026 se il libro era in 2ª
                libro_ex_2 = await libro_in_classe(db, isbn, codice_scuola, 2, "2025/2026")
                if libro_ex_2:
                    # Ma verifica se serve ANCHE in 2ª quest'anno
                    libro_in_2_attuale = await db.adozioni.find_one({
                        "codice_scuola": codice_scuola,
                        "anno_corso": "2",
                        "isbn": isbn
                    })
                    if not libro_in_2_attuale:
                        # NON serve in 2ª → gli ex 2ª possono venderlo!
                        return ("USATO", "Ex 2ª possono venderlo", 0)
            
            # Per libri NON unici: cerca se in 1ª dello scorso anno c'era
            libro_ex_1 = await libro_in_classe(db, isbn, codice_scuola, 1, "2025/2026")
            if libro_ex_1:
                return ("USATO", "Ex 1ª possono venderlo", 0)
            
            # Nuova adozione check
            if nuova_adozione:
                return ("NUOVO", "Nuova adozione", 0)
            
            return ("NUOVO", "Non esistono copie usate", 0)
        
        # ----------------------------------------------------------
        # ANNI SUCCESSIVI (2ª, 3ª, 4ª, 5ª)
        # ----------------------------------------------------------
        
        # Determina se il libro va comprato
        # Consigliato = SI significa che va comprato (trucco scuole)
        consigliato_bool = consigliato_raw and consigliato_raw.upper() not in ['NO', 'N', '']
        deve_comprare = da_acquistare or consigliato_bool
        
        if deve_comprare:
            # DA COMPRARE
            if copie > 0:
                return ("USATO", f"{copie} copie disponibili", copie)
            
            # Cerca nella classe successiva (chi può vendere)
            classe_succ = classe + 1
            if classe_succ <= 5:
                libro_succ = await libro_in_classe(db, isbn, codice_scuola, classe_succ, "2025/2026")
                if libro_succ:
                    return ("USATO", f"Ex {classe_succ}ª possono venderlo", 0)
            
            # Se è ultima classe (2ª per biennio, 5ª per triennio), cerca ex stessa classe
            if classe == classe_max_ciclo:
                libro_ex = await libro_in_classe(db, isbn, codice_scuola, classe, "2025/2026")
                if libro_ex:
                    return ("USATO", f"Ex {classe}ª possono venderlo", 0)
            
            if nuova_adozione:
                return ("NUOVO", "Nuova adozione", 0)
            
            return ("NUOVO", "Non esistono copie usate", 0)
        
        else:
            # da_acquistare = NO e consigliato = NO → GIÀ POSSEDUTO
            return ("GIA_POSSEDUTO", "Già acquistato in anni precedenti", 0)


async def libro_unico_serve_ancora(db, libro: dict, classe: int, tipo_scuola: str,
                                    codice_scuola: str) -> Tuple[bool, str]:
    """
    Verifica se un libro UNICO serve ancora nella classe successiva.
    
    LOGICA per un 3° superiore con libro "Fisica Generale":
    1. Controllo se nella 4° (2025/2026) c'è la materia "Fisica"
    2. Se sì, controllo se nel 3° (2024/2025) c'era lo stesso ISBN
    3. Se entrambi sì → serve ancora (i 4° lo useranno)
    
    Returns:
        (serve_ancora, motivo)
    """
    isbn = libro.get('isbn', '')
    disciplina = libro.get('disciplina', '').strip().upper()
    
    ciclo_info = get_ciclo_info(tipo_scuola, classe)
    classe_succ = classe + 1
    
    # Se siamo all'ultima classe del ciclo, non serve più
    if classe >= ciclo_info.get('classe_max'):
        return (False, "Fine ciclo - non serve più")
    
    # 1. Controllo se nella classe successiva (2025/2026) c'è la stessa materia
    adozione_succ = await db.adozioni.find_one({
        "codice_scuola": codice_scuola,
        "classe": classe_succ
    })
    
    if not adozione_succ:
        return (False, "Classe successiva non trovata")
    
    # Cerca la materia nella classe successiva
    materia_in_succ = False
    for l in adozione_succ.get('libri', []):
        disc_succ = l.get('disciplina', '').strip().upper()
        if disc_succ and disciplina and disc_succ[:10] == disciplina[:10]:
            materia_in_succ = True
            break
    
    if not materia_in_succ:
        return (False, f"Materia {disciplina[:15]} non presente in {classe_succ}°")
    
    # 2. Controllo se nella classe attuale l'anno scorso (2024/2025) c'era lo stesso ISBN
    libro_anno_scorso = await libro_in_classe(db, isbn, codice_scuola, classe, "2024/2025")
    
    if libro_anno_scorso:
        # Lo stesso libro era usato l'anno scorso per questa classe
        # Significa che è un volume unico che dura più anni → serve ancora
        return (True, f"Volume unico usato anche in {classe_succ}°")
    
    return (False, "Non era presente l'anno scorso")


async def calcola_vendibili(db, libri_storici: List[dict], classe: int, tipo_scuola: str,
                            codice_scuola: str, sezione: str = None) -> Tuple[List[dict], List[dict]]:
    """
    Calcola quali libri storici possono essere venduti
    
    LOGICA:
    - I libri che lo studente ha comprato in anni precedenti possono essere venduti
      SE sono richiesti nelle liste delle classi precedenti (stesso ISBN per unici,
      stesso titolo/autore/editore per annuali)
    
    Returns:
        (vendibili, non_vendibili)
    """
    vendibili = []
    non_vendibili = []
    
    ciclo_info = get_ciclo_info(tipo_scuola, classe)
    
    # Determina le classi a cui può vendere (classi inferiori alla sua)
    if tipo_scuola == "primo_grado":
        classi_vendita = list(range(1, classe))  # [1] per 2°, [1,2] per 3°
    else:
        if classe <= 2:
            classi_vendita = list(range(1, classe))
        elif classe == 3:
            classi_vendita = [1, 2]  # Può vendere libri del biennio
        else:
            classi_vendita = list(range(3, classe))
    
    # Carica libri della classe attuale per verificare se servono ancora (stesso ISBN)
    adozione_attuale = await db.adozioni.find_one({
        "codice_scuola": codice_scuola,
        "classe": classe
    })
    
    isbn_attuali = set()
    if adozione_attuale:
        for libro in adozione_attuale.get('libri', []):
            if libro.get('isbn'):
                isbn_attuali.add(libro.get('isbn'))
    
    # Per ogni libro storico (che lo studente ha comprato in anni precedenti)
    for libro in libri_storici:
        isbn = libro.get('isbn', '')
        titolo = libro.get('titolo', '')
        autori = libro.get('autori', '')
        editore = libro.get('editore', '')
        disciplina = libro.get('disciplina', '')
        is_volume_unico = libro.get('is_volume_unico', False)
        prezzo = libro.get('prezzo_copertina', 0)
        
        if not isbn:
            continue
        
        # =====================================================
        # CASO 1: Libro ancora in uso nella classe attuale (stesso ISBN)
        # =====================================================
        if isbn in isbn_attuali:
            non_vendibili.append({
                "isbn": isbn,
                "titolo": titolo,
                "disciplina": disciplina,
                "is_volume_unico": is_volume_unico,
                "status": "SERVE ANCORA",
                "motivo": f"Usato anche in {classe}ª"
            })
            continue
        
        # =====================================================
        # CASO 2: SCUOLA MEDIA - Verifica se il libro è richiesto in 1ª o 2ª
        # VOLUMI UNICI: cerca stesso ISBN
        # LIBRI ANNUALI: cerca stessa materia/titolo (le edizioni cambiano!)
        # =====================================================
        if tipo_scuola == "primo_grado":
            libro_richiesto = False
            classe_destinazione = None
            
            # RELIGIONE e SCIENZE MOTORIE sono QUINQUENNALI → tratta come volumi unici
            is_quinquennale = any(materia in disciplina.upper() for materia in [
                'RELIGIONE', 'SCIENZE MOTORIE', 'EDUCAZIONE FISICA'
            ]) if disciplina else False
            
            for cl in [1, 2]:
                adozione_cl = await db.adozioni.find_one({
                    "codice_scuola": codice_scuola,
                    "classe": cl
                })
                if adozione_cl:
                    for l in adozione_cl.get('libri', []):
                        if is_volume_unico or is_quinquennale:
                            # VOLUME UNICO o QUINQUENNALE: cerca stesso ISBN
                            if l.get('isbn') == isbn:
                                libro_richiesto = True
                                classe_destinazione = cl
                                break
                        else:
                            # LIBRO ANNUALE: cerca stessa materia (edizioni cambiano!)
                            # Confronta disciplina
                            disc_l = l.get('disciplina', '').strip().upper()
                            disc_libro = disciplina.strip().upper() if disciplina else ''
                            if disc_l and disc_libro and disc_l[:15] == disc_libro[:15]:
                                # Stessa materia trovata - verifico che sia annuale
                                if not l.get('is_volume_unico', False):
                                    libro_richiesto = True
                                    classe_destinazione = cl
                                    break
                if libro_richiesto:
                    break
            
            # Cross-scuola: cerca anche in altre scuole medie di Catanzaro
            if not libro_richiesto:
                scuole = await get_scuole_catanzaro(db, tipo_scuola)
                for altra_scuola in scuole:
                    if altra_scuola == codice_scuola:
                        continue
                    for cl in [1, 2]:
                        adozione_altra = await db.adozioni.find_one({
                            "codice_scuola": altra_scuola,
                            "classe": cl
                        })
                        if adozione_altra:
                            for l in adozione_altra.get('libri', []):
                                if is_volume_unico or is_quinquennale:
                                    # VOLUME UNICO o QUINQUENNALE: cerca stesso ISBN
                                    if l.get('isbn') == isbn:
                                        libro_richiesto = True
                                        classe_destinazione = cl
                                        break
                                else:
                                    # LIBRO ANNUALE: cerca stessa materia
                                    disc_l = l.get('disciplina', '').strip().upper()
                                    disc_libro = disciplina.strip().upper() if disciplina else ''
                                    if disc_l and disc_libro and disc_l[:15] == disc_libro[:15]:
                                        if not l.get('is_volume_unico', False):
                                            libro_richiesto = True
                                            classe_destinazione = cl
                                            break
                        if libro_richiesto:
                            break
                    if libro_richiesto:
                        break
            
            if libro_richiesto:
                vendibili.append({
                    "isbn": isbn,
                    "titolo": titolo,
                    "disciplina": disciplina,
                    "editore": editore,
                    "prezzo_copertina": prezzo,
                    "prezzo_consigliato": round(prezzo * 0.5, 2),
                    "is_volume_unico": is_volume_unico,
                    "status": "VENDIBILE",
                    "motivo": f"Richiesto in {classe_destinazione}ª"
                })
            else:
                non_vendibili.append({
                    "isbn": isbn,
                    "titolo": titolo,
                    "disciplina": disciplina,
                    "is_volume_unico": is_volume_unico,
                    "status": "NON VENDIBILE",
                    "motivo": "Non richiesto nelle liste attuali"
                })
            continue
        
        # =====================================================
        # CASO 2: Libro UNICO - verifica se serve nella classe successiva
        # =====================================================
        if is_volume_unico:
            serve_ancora, motivo = await libro_unico_serve_ancora(
                db, libro, classe, tipo_scuola, codice_scuola
            )
            
            if serve_ancora:
                non_vendibili.append({
                    "isbn": isbn,
                    "titolo": titolo,
                    "disciplina": disciplina,
                    "status": "SERVE ANCORA",
                    "motivo": motivo
                })
                continue
        
        # =====================================================
        # CASO 3: Cerca se il libro è richiesto nelle classi a cui vendere
        # VOLUMI UNICI: cerca stesso ISBN nelle classi precedenti (nuovo anno)
        # LIBRI ANNUALI: cerca stessa materia (le edizioni cambiano!)
        # =====================================================
        if is_volume_unico:
            # VOLUME UNICO: cerca stesso ISBN
            trovato = await cerca_libro_in_classi_precedenti(
                db, isbn, tipo_scuola, classi_vendita, codice_scuola
            )
        else:
            # LIBRO ANNUALE: cerca stessa materia (non ISBN)
            trovato = await cerca_materia_in_classi_precedenti(
                db, disciplina, tipo_scuola, classi_vendita, codice_scuola
            )
        
        if trovato:
            vendibili.append({
                "isbn": isbn,
                "titolo": titolo,
                "disciplina": disciplina,
                "editore": editore,
                "prezzo_copertina": libro.get('prezzo_copertina', 0),
                "status": "VENDIBILE",
                "vendi_a": f"{trovato['classe']}ª {trovato['scuola']}",
                "motivo": "Richiesto dai nuovi studenti"
            })
        else:
            non_vendibili.append({
                "isbn": isbn,
                "titolo": titolo,
                "disciplina": disciplina,
                "status": "NON VENDIBILE",
                "motivo": "Non più adottato o edizione cambiata"
            })
    
    return vendibili, non_vendibili


async def cerca_libro_in_classi_precedenti(db, isbn: str, tipo_scuola: str, 
                                            classi: List[int], codice_scuola: str) -> Optional[dict]:
    """
    Cerca un ISBN nelle classi precedenti (stessa scuola + cross-scuola)
    """
    scuole = await get_scuole_catanzaro(db, tipo_scuola)
    
    # Prima stessa scuola
    for classe_target in classi:
        risultato = await libro_in_classe(db, isbn, codice_scuola, classe_target, "2025/2026")
        if risultato:
            return {"classe": classe_target, "scuola": "stessa scuola", "libro": risultato}
    
    # Poi altre scuole
    for altra_scuola in scuole:
        if altra_scuola == codice_scuola:
            continue
        for classe_target in classi:
            risultato = await libro_in_classe(db, isbn, altra_scuola, classe_target, "2025/2026")
            if risultato:
                return {"classe": classe_target, "scuola": "altra scuola", "libro": risultato}
    
    return None


async def cerca_materia_in_classi_precedenti(db, disciplina: str, tipo_scuola: str,
                                               classi: List[int], codice_scuola: str) -> Optional[dict]:
    """
    Cerca una MATERIA (non ISBN) nelle classi precedenti.
    Usato per libri ANNUALI dove le edizioni cambiano ma la materia rimane.
    
    NON confronta ISBN perché le edizioni cambiano da un anno all'altro.
    """
    if not disciplina:
        return None
    
    disciplina_upper = disciplina.strip().upper()[:15]  # Primi 15 caratteri
    scuole = await get_scuole_catanzaro(db, tipo_scuola)
    
    # Prima stessa scuola
    for classe_target in classi:
        adozione = await db.adozioni.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe_target
        })
        if adozione:
            for libro in adozione.get('libri', []):
                disc = libro.get('disciplina', '').strip().upper()[:15]
                if disc and disc == disciplina_upper:
                    # Trovato! La materia è ancora richiesta
                    if not libro.get('is_volume_unico', False):
                        return {"classe": classe_target, "scuola": "stessa scuola", "libro": libro}
    
    # Poi altre scuole
    for altra_scuola in scuole:
        if altra_scuola == codice_scuola:
            continue
        for classe_target in classi:
            adozione = await db.adozioni.find_one({
                "codice_scuola": altra_scuola,
                "classe": classe_target
            })
            if adozione:
                for libro in adozione.get('libri', []):
                    disc = libro.get('disciplina', '').strip().upper()[:15]
                    if disc and disc == disciplina_upper:
                        if not libro.get('is_volume_unico', False):
                            return {"classe": classe_target, "scuola": "altra scuola", "libro": libro}
    
    return None


async def cerca_volume_precedente_annuale(db, libro: dict, tipo_scuola: str,
                                           classi: List[int], codice_scuola: str) -> Optional[dict]:
    """
    Per un libro ANNUALE, cerca nelle classi precedenti un libro con:
    - Stesso titolo base (senza numero volume)
    - Stesso autore
    - Stesso editore
    - Volume PRECEDENTE
    
    Es: Se ho "Storia Vol.2", cerca "Storia Vol.1" nelle classi 1°
    """
    titolo = libro.get('titolo', '')
    autori = libro.get('autori', '').upper().strip()
    editore = libro.get('editore', '').upper().strip()
    
    nome_base = estrai_nome_base_libro(titolo)
    vol_attuale = estrai_numero_volume(titolo, libro.get('volume', ''))
    
    if not nome_base:
        return None
    
    scuole = await get_scuole_catanzaro(db, tipo_scuola)
    scuole_ordinate = [codice_scuola] + [s for s in scuole if s != codice_scuola]
    
    for scuola in scuole_ordinate:
        for classe_target in classi:
            adozione = await db.adozioni.find_one({
                "codice_scuola": scuola,
                "classe": classe_target
            })
            
            if not adozione:
                continue
            
            for libro_target in adozione.get('libri', []):
                titolo_target = libro_target.get('titolo', '')
                autori_target = libro_target.get('autori', '').upper().strip()
                editore_target = libro_target.get('editore', '').upper().strip()
                
                # Stesso editore?
                if editore and editore_target and editore[:10] != editore_target[:10]:
                    continue
                
                # Stesso autore? (almeno prime lettere)
                if autori and autori_target and autori[:15] != autori_target[:15]:
                    continue
                
                # Stesso titolo base?
                nome_base_target = estrai_nome_base_libro(titolo_target)
                if nome_base != nome_base_target:
                    continue
                
                # Volume precedente?
                vol_target = estrai_numero_volume(titolo_target, libro_target.get('volume', ''))
                
                if vol_attuale is not None and vol_target is not None:
                    if vol_target == vol_attuale - 1:
                        tipo_scuola_label = "stessa scuola" if scuola == codice_scuola else "altra scuola"
                        return {"classe": classe_target, "scuola": tipo_scuola_label, "libro": libro_target}
    
    return None
