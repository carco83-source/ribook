"""
Logica di classificazione libri per acquisto e vendita

STRUTTURA CICLI:
- MEDIE (8 scuole): Triennio unico (1°-2°-3°)
  - Volumi annuali: 1, 2, 3
  - Volumi unici: triennali

- SUPERIORI (13 scuole):
  - BIENNIO (1°-2°): Volumi annuali 1, 2 | Volumi unici biennali
  - TRIENNIO (3°-4°-5°): Volumi annuali 1, 2, 3 | Volumi unici triennali

LOGICA ACQUISTO (INTRA-ANNO - usa solo dati 2025/2026):
- nuova_adozione=TRUE → NUOVO
- da_acquistare=NO + consigliato_raw=NO/SI → GIÀ POSSEDUTO
- da_acquistare=NO + consigliato_raw=AP → DA ACQUISTARE (verifica USATO/NUOVO)
- da_acquistare=SI → DA ACQUISTARE (verifica USATO/NUOVO)

LOGICA USATO INTRA-ANNO (evita dati storici inaffidabili):
- MEDIE: Confronta ISBN tra 1ª e 3ª dello stesso anno
  Se stesso ISBN in entrambe → è triennale → ex 3ª possono vendere a 1ª
- SUPERIORI BIENNIO: Confronta ISBN tra 1ª e 2ª dello stesso anno
- SUPERIORI TRIENNIO: Confronta ISBN tra 3ª, 4ª, 5ª dello stesso anno

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
    
    Returns:
        (stato, motivo, copie_disponibili)
        stato: "NUOVO", "USATO", "GIA_POSSEDUTO"
    """
    isbn = libro.get('isbn', '')
    nuova_adozione = libro.get('nuova_adozione', False)
    da_acquistare = libro.get('da_acquistare', True)
    consigliato_raw = libro.get('consigliato_raw', 'NO').upper()
    is_volume_unico = libro.get('is_volume_unico', False)
    
    # Conta copie disponibili per questo ISBN
    copie = await db.listings.count_documents({
        "book_isbn": isbn,
        "status": "available"
    })
    
    # ============================================================
    # SCUOLA MEDIA (primo_grado) - LOGICA SEMPLIFICATA
    # ============================================================
    if tipo_scuola == "primo_grado":
        
        # ----------------------------------------------------------
        # VOLUMI UNICI: si comprano SOLO in 1ª, durano 3 anni
        # LOGICA INTRA-ANNO (evita dati storici inaffidabili):
        # Confronto ISBN tra 1ª e 3ª DELLO STESSO ANNO 2025/2026
        # Se lo stesso ISBN appare in entrambe → è triennale
        # Chi esce dalla 3ª può venderlo a chi entra in 1ª
        # ----------------------------------------------------------
        if is_volume_unico:
            if classe == 1:
                # 1ª MEDIA: deve comprare il volume unico
                if nuova_adozione:
                    return ("NUOVO", "Nuova adozione - primo anno", 0)
                
                # Se ci sono copie caricate manualmente → USATO
                if copie > 0:
                    return ("USATO", f"{copie} copie disponibili", copie)
                
                # LOGICA INTRA-ANNO: verifica se stesso ISBN esiste in 3ª (2025/2026)
                # Se sì → è un libro triennale, chi esce dalla 3ª può venderlo
                libro_in_terza = await libro_in_classe(db, isbn, codice_scuola, 3, "2025/2026")
                if libro_in_terza:
                    # Libro triennale confermato - potenzialmente disponibile usato
                    return ("USATO", "Triennale - ex 3ª possono vendere", 0)
                
                # Cross-scuola: cerca nelle altre medie di Catanzaro
                scuole_medie = await get_scuole_catanzaro(db, tipo_scuola)
                for altra_scuola in scuole_medie:
                    if altra_scuola != codice_scuola:
                        libro_altra_terza = await libro_in_classe(db, isbn, altra_scuola, 3, "2025/2026")
                        if libro_altra_terza:
                            return ("USATO", "Triennale - disponibile da altra scuola", 0)
                
                # Non trovato in nessuna 3ª → probabilmente nuovo o non triennale
                return ("NUOVO", "Volume unico triennale", 0)
            
            else:
                # 2ª o 3ª MEDIA: volume unico GIÀ POSSEDUTO (comprato in 1ª)
                return ("GIA_POSSEDUTO", "Volume unico triennale (comprato in 1ª)", 0)
        
        # ----------------------------------------------------------
        # LIBRI ANNUALI: si comprano ogni anno
        # ----------------------------------------------------------
        else:
            # Libro annuale - verifica se può comprare USATO
            if nuova_adozione:
                return ("NUOVO", "Nuova adozione - non esiste usato", 0)
            
            if copie > 0:
                return ("USATO", f"{copie} copie disponibili", copie)
            
            # Cerca se esisteva l'anno scorso nella stessa classe
            libro_anno_scorso = await libro_in_classe(db, isbn, codice_scuola, classe, "2024/2025")
            if libro_anno_scorso:
                classe_succ = classe + 1
                return ("USATO", f"I {classe_succ}° (ex {classe}°) possono venderlo", 0)
            
            # Cross-scuola
            scuole = await get_scuole_catanzaro(db, tipo_scuola)
            for altra_scuola in scuole:
                if altra_scuola != codice_scuola:
                    libro_altra = await libro_in_classe(db, isbn, altra_scuola, classe, "2024/2025")
                    if libro_altra:
                        return ("USATO", "Disponibile da altra scuola", 0)
            
            return ("NUOVO", "Non esistono copie usate", 0)
    
    # ============================================================
    # SCUOLA SUPERIORE (secondo_grado) - LOGICA INTRA-ANNO
    # Per evitare dati storici inaffidabili, confrontiamo solo 2025/2026
    # ============================================================
    else:
        ciclo_info = get_ciclo_info(tipo_scuola, classe)
        classe_min_ciclo = ciclo_info.get('classe_min', 1)
        classe_max_ciclo = ciclo_info.get('classe_max', 5)
        
        # ----------------------------------------------------------
        # REGOLA 1: VOLUME UNICO in classe > prima del ciclo → GIÀ POSSEDUTO
        # ----------------------------------------------------------
        if is_volume_unico and classe > classe_min_ciclo:
            # Verifica che non sia da_acquistare=True con consigliato_raw='AP'
            # In quel caso è una nuova adozione anche se unico
            if da_acquistare and consigliato_raw == 'AP':
                # Nuova adozione mid-ciclo, deve comprare
                pass
            else:
                return ("GIA_POSSEDUTO", f"Volume unico (comprato in {classe_min_ciclo}ª)", 0)
        
        # ----------------------------------------------------------
        # REGOLA 2: da_acquistare=NO + consigliato!=AP → GIÀ POSSEDUTO
        # ----------------------------------------------------------
        if not da_acquistare and consigliato_raw not in ['AP', 'MO']:
            return ("GIA_POSSEDUTO", "Già acquistato in anni precedenti", 0)
        
        # ----------------------------------------------------------
        # REGOLA 3: NUOVA ADOZIONE → NUOVO
        # ----------------------------------------------------------
        if nuova_adozione:
            return ("NUOVO", "Nuova adozione - non esiste usato", 0)
        
        # ----------------------------------------------------------
        # REGOLA 4: Copie disponibili → USATO
        # ----------------------------------------------------------
        if copie > 0:
            return ("USATO", f"{copie} copie disponibili", copie)
        
        # ----------------------------------------------------------
        # REGOLA 5 (INTRA-ANNO): Cerca se stesso ISBN esiste in classe superiore del ciclo
        # BIENNIO (1-2): Se in 1ª cerco ISBN in 2ª → ex 2ª possono vendere
        # TRIENNIO (3-4-5): Se in 3ª cerco ISBN in 4ª/5ª → possono vendere
        # ----------------------------------------------------------
        classe_da_cercare = classe + 1
        if classe_da_cercare <= classe_max_ciclo:
            libro_classe_sup = await libro_in_classe(db, isbn, codice_scuola, classe_da_cercare, "2025/2026")
            if libro_classe_sup:
                return ("USATO", f"Ex {classe_da_cercare}° possono venderlo", 0)
            
            # Cross-scuola
            scuole = await get_scuole_catanzaro(db, tipo_scuola)
            for altra_scuola in scuole:
                if altra_scuola != codice_scuola:
                    libro_altra = await libro_in_classe(db, isbn, altra_scuola, classe_da_cercare, "2025/2026")
                    if libro_altra:
                        return ("USATO", "Disponibile da altra scuola", 0)
        
        # ----------------------------------------------------------
        # REGOLA 6: Non trovato usato → NUOVO
        # ----------------------------------------------------------
        return ("NUOVO", "Non esistono copie usate", 0)


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
        # Se lo stesso ISBN è nelle liste di 1ª o 2ª → VENDIBILE
        # Altrimenti → NON VENDIBILE
        # =====================================================
        if tipo_scuola == "primo_grado":
            # Cerca se lo stesso ISBN è richiesto in 1ª o 2ª (2025/2026)
            libro_richiesto = False
            classe_destinazione = None
            
            for cl in [1, 2]:
                adozione_cl = await db.adozioni.find_one({
                    "codice_scuola": codice_scuola,
                    "classe": cl
                })
                if adozione_cl:
                    for l in adozione_cl.get('libri', []):
                        if l.get('isbn') == isbn:
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
                                if l.get('isbn') == isbn:
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
        # CASO 3: Cerca se lo STESSO libro è richiesto nelle classi a cui vendere
        # Per ANNUALI: cerca stesso ISBN nelle classi precedenti (nuovo anno)
        # Per UNICI: cerca stesso ISBN nelle classi precedenti (nuovo anno)
        # =====================================================
        trovato = await cerca_libro_in_classi_precedenti(
            db, isbn, tipo_scuola, classi_vendita, codice_scuola
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
