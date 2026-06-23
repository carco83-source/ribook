"""
COLLEZIONI PROTETTE - NON CANCELLARE MAI

Questo file definisce le collezioni del database che NON devono MAI essere cancellate.
Usato per prevenire cancellazioni accidentali durante lo sviluppo.
"""

# Collezioni che contengono dati critici e NON devono essere cancellate
PROTECTED_COLLECTIONS = [
    'books',           # Dati MIUR 2025/2026 - 7.555 libri
    'adozioni',        # Dati MIUR 2026/2027 - 7.610 libri
    'schools',         # 19 scuole target di Catanzaro
    'users',           # Utenti registrati
    'listings',        # Annunci di vendita
    'orders',          # Ordini e transazioni
    'notifications',   # Notifiche utenti
    'conversations',   # Conversazioni chat
    'messages',        # Messaggi chat
    'bookstores',      # Cartolibrerie
    'bookstore_notifications',  # Notifiche cartolibrerie
]

# Collezioni che possono essere svuotate in sicurezza (es. per test)
SAFE_TO_CLEAR_COLLECTIONS = [
    'sessions',        # Sessioni temporanee
    'temp_profiles',   # Profili temporanei anonimi
]

def is_protected(collection_name: str) -> bool:
    """Verifica se una collezione è protetta."""
    return collection_name in PROTECTED_COLLECTIONS

def can_safely_clear(collection_name: str) -> bool:
    """Verifica se una collezione può essere svuotata in sicurezza."""
    return collection_name in SAFE_TO_CLEAR_COLLECTIONS
