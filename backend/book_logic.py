"""
Logica di classificazione libri per acquisto e vendita

STRUTTURA CICLI:
- MEDIE (8 scuole): Triennio unico (1°-2°-3°)
  - Volumi annuali: 1, 2, 3
  - Volumi unici: triennali

- SUPERIORI (13 scuole):
  - BIENNIO (1°-2°): Volumi annuali 1, 2 | Volumi unici biennali
  - TRIENNIO (3°-4°-5°): Volumi annuali 1, 2, 3 | Volumi unici triennali

LOGICA ACQUISTO:
- nuova_adozione=TRUE → NUOVO
- da_acquistare=NO + consigliato_raw=NO/SI → GIÀ POSSEDUTO
- da_acquistare=NO + consigliato_raw=AP → DA ACQUISTARE (verifica USATO/NUOVO)
- da_acquistare=SI → DA ACQUISTARE (verifica USATO/NUOVO)

LOGICA VENDITA:
- Libro non in lista attuale + richiesto in classi precedenti → VENDIBILE
- Libro ancora in lista attuale → ANCORA IN USO
- Libro non richiesto da nessuno → NON VENDIBILE
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


async def get_scuole_catanzaro(db, tipo_scuola: str) -> List[str]:
    """
    Restituisce i codici scuola di Catanzaro per tipo
    
    Args:
        tipo_scuola: 'primo_grado' (medie) o 'secondo_grado' (superiori)
    
    Returns:
        Lista di codici scuola
    """
    cursor = db.adozioni.distinct("codice_scuola", {"tipo_scuola": tipo_scuola})
    return await cursor


async def libro_in_classe(db, isbn: str, codice_scuola: str, classe: int, 
                          anno: str = "2025/2026") -> Optional[dict]:
    """
    Verifica se un ISBN è presente in una specifica classe/scuola
    
    Args:
        anno: "2025/2026" per adozioni correnti, "2024/2025" per storico
    
    Returns:
        Il libro se trovato, None altrimenti
    """
    collection = "adozioni" if anno == "2025/2026" else "adozioni_2024_2025"
    
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
    
    Returns:
        (stato, motivo, copie_disponibili)
        stato: "NUOVO", "USATO", "GIA_POSSEDUTO"
    """
    isbn = libro.get('isbn', '')
    nuova_adozione = libro.get('nuova_adozione', False)
    da_acquistare = libro.get('da_acquistare', True)
    consigliato_raw = libro.get('consigliato_raw', 'NO').upper()
    is_volume_unico = libro.get('is_volume_unico', False)
    
    # ========================================
    # ECCEZIONE 1: COPIE IN VENDITA → USATO
    # ========================================
    copie = await db.listings.count_documents({
        "book_isbn": isbn,
        "status": "available"
    })
    
    if copie > 0:
        return ("USATO", f"{copie} copie disponibili", copie)
    
    # ========================================
    # REGOLA 1: NUOVA ADOZIONE → NUOVO
    # ========================================
    if nuova_adozione:
        return ("NUOVO", "Nuova adozione - non esiste usato", 0)
    
    # ========================================
    # REGOLA 2: da_acquistare=NO + consigliato!=AP → GIÀ POSSEDUTO
    # ========================================
    if not da_acquistare and consigliato_raw not in ['AP', 'MO']:
        return ("GIA_POSSEDUTO", "Già acquistato in anni precedenti", 0)
    
    # ========================================
    # REGOLA 3-4: DA ACQUISTARE - Verifica USATO o NUOVO
    # ========================================
    ciclo_info = get_ciclo_info(tipo_scuola, classe)
    classe_succ = ciclo_info.get('classe_successiva')
    
    if is_volume_unico:
        # --- VOLUME UNICO ---
        # Verifica se la classe successiva lo ha ancora
        if classe_succ:
            in_classe_succ = await libro_in_classe(db, isbn, codice_scuola, classe_succ, "2025/2026")
            
            if in_classe_succ:
                return ("NUOVO", f"I {classe_succ}° lo usano ancora", 0)
            
            # Verifica se la classe successiva lo aveva l'anno scorso
            in_classe_succ_prec = await libro_in_classe(db, isbn, codice_scuola, classe_succ, "2024/2025")
            
            if in_classe_succ_prec:
                return ("USATO", f"I {classe_succ}° dell'anno scorso possono venderlo", 0)
        
        # Cross-scuola
        if classe_succ:
            risultati_cross = await cerca_isbn_in_classi(
                db, isbn, tipo_scuola, [classe_succ], "2024/2025", codice_scuola
            )
            if risultati_cross:
                return ("USATO", "Disponibile da altra scuola", 0)
        
        # Se siamo all'ultima classe del ciclo, cerca negli ex-studenti
        if classe == ciclo_info.get('classe_max'):
            # Gli ex-studenti del ciclo precedente possono venderlo
            risultati_ex = await cerca_isbn_in_classi(
                db, isbn, tipo_scuola, [classe], "2024/2025"
            )
            if risultati_ex:
                return ("USATO", "Ex-studenti possono venderlo", 0)
        
        return ("NUOVO", "Nessuno può venderlo", 0)
    
    else:
        # --- VOLUME ANNUALE ---
        # Cerca il SEGUITO nella classe successiva
        if classe_succ:
            # Prima nella stessa scuola
            adozione_succ = await db.adozioni.find_one({
                "codice_scuola": codice_scuola,
                "classe": classe_succ
            })
            
            if adozione_succ:
                seguito = trova_volume_successivo(libro, adozione_succ.get('libri', []))
                if seguito:
                    return ("USATO", f"I {classe_succ}° possono vendere questo volume", 0)
            
            # Cross-scuola
            risultati_seguito = await cerca_seguito_volume(db, libro, tipo_scuola, classe_succ)
            if risultati_seguito:
                return ("USATO", "Volume precedente disponibile da altra scuola", 0)
        
        return ("NUOVO", "Seguito non trovato", 0)


async def calcola_vendibili(db, libri_storici: List[dict], classe: int, tipo_scuola: str,
                            codice_scuola: str, sezione: str = None) -> Tuple[List[dict], List[dict]]:
    """
    Calcola quali libri storici possono essere venduti
    
    Args:
        libri_storici: libri che lo studente ha comprato in anni precedenti
        classe: classe attuale dello studente
        
    Returns:
        (vendibili, non_vendibili)
    """
    vendibili = []
    non_vendibili = []
    
    ciclo_info = get_ciclo_info(tipo_scuola, classe)
    classi_precedenti = ciclo_info.get('classi_precedenti', [])
    
    # Carica libri della classe attuale per escludere quelli ancora in uso
    adozione_attuale = await db.adozioni.find_one({
        "codice_scuola": codice_scuola,
        "classe": classe,
        "sezione": sezione
    }) if sezione else await db.adozioni.find_one({
        "codice_scuola": codice_scuola,
        "classe": classe
    })
    
    isbn_attuali = set()
    if adozione_attuale:
        for libro in adozione_attuale.get('libri', []):
            if libro.get('isbn'):
                isbn_attuali.add(libro.get('isbn'))
    
    # Per ogni libro storico
    for libro in libri_storici:
        isbn = libro.get('isbn', '')
        
        if not isbn:
            continue
        
        # CASO 1: Libro ancora in uso nella classe attuale
        if isbn in isbn_attuali:
            non_vendibili.append({
                "isbn": isbn,
                "titolo": libro.get('titolo', ''),
                "disciplina": libro.get('disciplina', ''),
                "status": "SERVE ANCORA",
                "motivo": f"Usato anche in {classe}ª"
            })
            continue
        
        # CASO 2-3: Verifica se richiesto in classi precedenti
        # Prima stessa scuola
        trovato_stessa_scuola = False
        for classe_prec in classi_precedenti:
            risultato = await libro_in_classe(db, isbn, codice_scuola, classe_prec, "2025/2026")
            if risultato:
                vendibili.append({
                    "isbn": isbn,
                    "titolo": libro.get('titolo', ''),
                    "disciplina": libro.get('disciplina', ''),
                    "editore": libro.get('editore', ''),
                    "prezzo_copertina": libro.get('prezzo_copertina', 0),
                    "status": "VENDIBILE",
                    "vendi_a": f"{classe_prec}ª stessa scuola",
                    "motivo": "Richiesto dai nuovi studenti"
                })
                trovato_stessa_scuola = True
                break
        
        if trovato_stessa_scuola:
            continue
        
        # Cross-scuola
        risultati_cross = await cerca_isbn_in_classi(
            db, isbn, tipo_scuola, classi_precedenti, "2025/2026", codice_scuola
        )
        
        if risultati_cross:
            prima_scuola = risultati_cross[0]
            vendibili.append({
                "isbn": isbn,
                "titolo": libro.get('titolo', ''),
                "disciplina": libro.get('disciplina', ''),
                "editore": libro.get('editore', ''),
                "prezzo_copertina": libro.get('prezzo_copertina', 0),
                "status": "VENDIBILE",
                "vendi_a": f"{prima_scuola['classe']}ª altra scuola",
                "motivo": "Richiesto da altre scuole"
            })
            continue
        
        # Verifica anche se richiesto nella stessa classe (per volumi annuali)
        risultato_stessa_classe = await libro_in_classe(db, isbn, codice_scuola, classe, "2025/2026")
        if not risultato_stessa_classe:
            # Cerca in altre scuole stessa classe
            risultati_stessa_classe_cross = await cerca_isbn_in_classi(
                db, isbn, tipo_scuola, [classe], "2025/2026", codice_scuola
            )
            if risultati_stessa_classe_cross:
                vendibili.append({
                    "isbn": isbn,
                    "titolo": libro.get('titolo', ''),
                    "disciplina": libro.get('disciplina', ''),
                    "editore": libro.get('editore', ''),
                    "prezzo_copertina": libro.get('prezzo_copertina', 0),
                    "status": "VENDIBILE",
                    "vendi_a": f"{classe}ª altra scuola",
                    "motivo": "Richiesto da altre scuole"
                })
                continue
        
        # CASO 4: Non richiesto da nessuno
        non_vendibili.append({
            "isbn": isbn,
            "titolo": libro.get('titolo', ''),
            "disciplina": libro.get('disciplina', ''),
            "status": "NON VENDIBILE",
            "motivo": "Edizione cambiata o non più adottato"
        })
    
    return vendibili, non_vendibili
