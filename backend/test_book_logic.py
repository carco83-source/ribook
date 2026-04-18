"""
Test delle funzioni di logica libri

Testa la nuova logica su profili reali per verificare correttezza
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
sys.path.append('/app/backend')

from book_logic import (
    get_ciclo_info,
    estrai_nome_base_libro,
    estrai_numero_volume,
    is_stesso_libro_volume_diverso,
    trova_volume_successivo,
    get_scuole_catanzaro,
    libro_in_classe,
    cerca_isbn_in_classi,
    cerca_seguito_volume,
    calcola_stato_acquisto,
    calcola_vendibili
)


async def test_ciclo_info():
    """Test get_ciclo_info"""
    print("\n" + "="*60)
    print("TEST: get_ciclo_info")
    print("="*60)
    
    test_cases = [
        ("primo_grado", 1, "1° Media"),
        ("primo_grado", 2, "2° Media"),
        ("primo_grado", 3, "3° Media"),
        ("secondo_grado", 1, "1° Superiore (biennio)"),
        ("secondo_grado", 2, "2° Superiore (biennio)"),
        ("secondo_grado", 3, "3° Superiore (triennio)"),
        ("secondo_grado", 4, "4° Superiore (triennio)"),
        ("secondo_grado", 5, "5° Superiore (triennio)"),
    ]
    
    for tipo, classe, desc in test_cases:
        info = get_ciclo_info(tipo, classe)
        print(f"\n{desc}:")
        print(f"  Ciclo: {info['ciclo']}")
        print(f"  Classe min-max: {info['classe_min']}-{info['classe_max']}")
        print(f"  Classi precedenti (a cui vendere): {info['classi_precedenti']}")
        print(f"  Classe successiva (chi vende a me): {info['classe_successiva']}")


def test_estrai_nome_base():
    """Test estrai_nome_base_libro"""
    print("\n" + "="*60)
    print("TEST: estrai_nome_base_libro")
    print("="*60)
    
    test_cases = [
        "STORIA VOL.1",
        "MATEMATICA VOLUME 2",
        "ANTOLOGIA 1",
        "FISICA - 3",
        "GRAMMATICA ITALIANA",
        "SCIENZE INTEGRATE VOL. 1",
        "L'AMALDI PER I LICEI SCIENTIFICI.BLU 2ED. - VOL. 1",
    ]
    
    for titolo in test_cases:
        nome_base = estrai_nome_base_libro(titolo)
        print(f"  '{titolo}' → '{nome_base}'")


def test_estrai_numero_volume():
    """Test estrai_numero_volume"""
    print("\n" + "="*60)
    print("TEST: estrai_numero_volume")
    print("="*60)
    
    test_cases = [
        ("STORIA VOL.1", "1"),
        ("MATEMATICA VOLUME 2", ""),
        ("ANTOLOGIA 1", ""),
        ("GRAMMATICA", "U"),
        ("SCIENZE VOL.3", "3"),
    ]
    
    for titolo, volume in test_cases:
        num = estrai_numero_volume(titolo, volume)
        print(f"  '{titolo}' (vol='{volume}') → Volume {num}")


async def test_libro_in_classe(db):
    """Test libro_in_classe"""
    print("\n" + "="*60)
    print("TEST: libro_in_classe")
    print("="*60)
    
    # Cerca un ISBN noto in una scuola
    test_isbn = "9788808899811"  # Un ISBN di esempio
    test_scuola = "CZMM86001P"  # Casalinuovo
    
    for classe in [1, 2, 3]:
        risultato = await libro_in_classe(db, test_isbn, test_scuola, classe, "2025/2026")
        if risultato:
            print(f"  ISBN {test_isbn} in {classe}ª Casalinuovo: ✅ TROVATO")
            print(f"    Titolo: {risultato.get('titolo', '')[:50]}")
        else:
            print(f"  ISBN {test_isbn} in {classe}ª Casalinuovo: ❌ Non trovato")


async def test_scuole_catanzaro(db):
    """Test get_scuole_catanzaro"""
    print("\n" + "="*60)
    print("TEST: get_scuole_catanzaro")
    print("="*60)
    
    medie = await get_scuole_catanzaro(db, "primo_grado")
    superiori = await get_scuole_catanzaro(db, "secondo_grado")
    
    print(f"  Scuole medie: {len(medie)}")
    for s in medie[:5]:
        print(f"    - {s}")
    if len(medie) > 5:
        print(f"    ... e altre {len(medie)-5}")
    
    print(f"\n  Scuole superiori: {len(superiori)}")
    for s in superiori[:5]:
        print(f"    - {s}")
    if len(superiori) > 5:
        print(f"    ... e altre {len(superiori)-5}")


async def test_cerca_seguito(db):
    """Test cerca_seguito_volume"""
    print("\n" + "="*60)
    print("TEST: cerca_seguito_volume")
    print("="*60)
    
    # Cerca un libro Vol.1 e vedi se trova Vol.2
    # Prima prendiamo un libro dalla 3° superiore
    adozione = await db.adozioni.find_one({
        "tipo_scuola": "secondo_grado",
        "classe": 3
    })
    
    if adozione:
        libri = adozione.get('libri', [])
        # Cerca un libro annuale (non volume unico)
        for libro in libri[:10]:
            if not libro.get('is_volume_unico') and libro.get('volume', '') not in ['U', '']:
                print(f"\n  Libro: {libro.get('titolo', '')[:50]}")
                print(f"  Editore: {libro.get('editore', '')}")
                print(f"  Volume: {libro.get('volume', '')}")
                
                # Cerca seguito in 4°
                seguiti = await cerca_seguito_volume(db, libro, "secondo_grado", 4)
                if seguiti:
                    for s in seguiti[:3]:
                        print(f"  ✅ Seguito trovato in {s['codice_scuola']}:")
                        print(f"     {s['libro_seguito'].get('titolo', '')[:50]}")
                else:
                    print(f"  ❌ Nessun seguito trovato in 4°")
                break


async def test_calcola_stato_acquisto(db):
    """Test calcola_stato_acquisto su libri reali"""
    print("\n" + "="*60)
    print("TEST: calcola_stato_acquisto (3° Superiore)")
    print("="*60)
    
    # Prendi una 3° superiore
    adozione = await db.adozioni.find_one({
        "tipo_scuola": "secondo_grado",
        "classe": 3
    })
    
    if adozione:
        codice_scuola = adozione.get('codice_scuola')
        sezione = adozione.get('sezione')
        print(f"\n  Scuola: {codice_scuola}, Sezione: {sezione}")
        
        libri = adozione.get('libri', [])
        
        # Testa 5 libri diversi
        contatori = {"NUOVO": 0, "USATO": 0, "GIA_POSSEDUTO": 0}
        
        for libro in libri[:15]:
            stato, motivo, copie = await calcola_stato_acquisto(
                db, libro, 3, "secondo_grado", codice_scuola, sezione
            )
            contatori[stato] = contatori.get(stato, 0) + 1
            
            # Mostra solo alcuni esempi per tipo
            if contatori[stato] <= 2:
                print(f"\n  [{stato}] {libro.get('titolo', '')[:45]}")
                print(f"    Motivo: {motivo}")
                print(f"    nuova_adozione: {libro.get('nuova_adozione')}")
                print(f"    da_acquistare: {libro.get('da_acquistare')}")
                print(f"    consigliato_raw: {libro.get('consigliato_raw', 'N/A')}")
                print(f"    is_volume_unico: {libro.get('is_volume_unico')}")
        
        print(f"\n  RIEPILOGO su {len(libri[:15])} libri:")
        for stato, count in contatori.items():
            print(f"    {stato}: {count}")


async def test_calcola_stato_acquisto_medie(db):
    """Test calcola_stato_acquisto su 2° media"""
    print("\n" + "="*60)
    print("TEST: calcola_stato_acquisto (2° Media)")
    print("="*60)
    
    # Prendi una 2° media
    adozione = await db.adozioni.find_one({
        "tipo_scuola": "primo_grado",
        "classe": 2
    })
    
    if adozione:
        codice_scuola = adozione.get('codice_scuola')
        sezione = adozione.get('sezione')
        print(f"\n  Scuola: {codice_scuola}, Sezione: {sezione}")
        
        libri = adozione.get('libri', [])
        contatori = {"NUOVO": 0, "USATO": 0, "GIA_POSSEDUTO": 0}
        
        for libro in libri[:15]:
            stato, motivo, copie = await calcola_stato_acquisto(
                db, libro, 2, "primo_grado", codice_scuola, sezione
            )
            contatori[stato] = contatori.get(stato, 0) + 1
            
            if contatori[stato] <= 2:
                print(f"\n  [{stato}] {libro.get('titolo', '')[:45]}")
                print(f"    Motivo: {motivo}")
                print(f"    consigliato_raw: {libro.get('consigliato_raw', 'N/A')}")
        
        print(f"\n  RIEPILOGO su {len(libri[:15])} libri:")
        for stato, count in contatori.items():
            print(f"    {stato}: {count}")


async def test_calcola_vendibili(db):
    """Test calcola_vendibili per un 3° superiore"""
    print("\n" + "="*60)
    print("TEST: calcola_vendibili (3° Superiore)")
    print("="*60)
    
    # Simula libri storici del biennio (1° e 2°)
    # Prendi libri dalla 2° della stessa scuola (storico)
    adozione_3 = await db.adozioni.find_one({
        "tipo_scuola": "secondo_grado",
        "classe": 3
    })
    
    if adozione_3:
        codice_scuola = adozione_3.get('codice_scuola')
        sezione = adozione_3.get('sezione')
        
        # Carica libri storici del biennio
        adozione_2_storico = await db.adozioni_2024_2025.find_one({
            "codice_scuola": codice_scuola,
            "classe": 2
        })
        
        if adozione_2_storico:
            libri_storici = [l for l in adozione_2_storico.get('libri', []) 
                           if l.get('da_acquistare', False)]
            
            print(f"\n  Scuola: {codice_scuola}")
            print(f"  Libri storici (2° 2024/2025): {len(libri_storici)}")
            
            vendibili, non_vendibili = await calcola_vendibili(
                db, libri_storici, 3, "secondo_grado", codice_scuola, sezione
            )
            
            print(f"\n  RISULTATI:")
            print(f"    Vendibili: {len(vendibili)}")
            print(f"    Non vendibili: {len(non_vendibili)}")
            
            print(f"\n  VENDIBILI (primi 5):")
            for v in vendibili[:5]:
                print(f"    ✅ {v.get('titolo', '')[:40]}")
                print(f"       Vendi a: {v.get('vendi_a')}")
            
            print(f"\n  NON VENDIBILI (primi 5):")
            for nv in non_vendibili[:5]:
                print(f"    ❌ {nv.get('titolo', '')[:40]}")
                print(f"       Status: {nv.get('status')} - {nv.get('motivo')}")


async def main():
    """Esegue tutti i test"""
    print("\n" + "#"*60)
    print("# TEST FUNZIONI LOGICA LIBRI")
    print("#"*60)
    
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.scambialibri
    
    try:
        # Test funzioni base (no DB)
        await test_ciclo_info()
        test_estrai_nome_base()
        test_estrai_numero_volume()
        
        # Test funzioni con DB
        await test_scuole_catanzaro(db)
        await test_libro_in_classe(db)
        await test_cerca_seguito(db)
        
        # Test logica principale
        await test_calcola_stato_acquisto(db)
        await test_calcola_stato_acquisto_medie(db)
        await test_calcola_vendibili(db)
        
        print("\n" + "#"*60)
        print("# TEST COMPLETATI")
        print("#"*60)
        
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
