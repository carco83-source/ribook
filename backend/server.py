from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import random
import string
import hashlib
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="ScambiaLibri API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============== MODELS ==============

# Book conditions with pricing percentages (OLD SYSTEM - kept for backwards compatibility)
BOOK_CONDITIONS_OLD = {
    "nuovo": 0.85,           # 85% - New with 15% discount
    "come_nuovo": 0.60,      # 60%
    "ottime_condizioni": 0.50,  # 50%
    "buono": 0.40,           # 40%
    "scarso": 0.30           # 30%
}

# NEW SIMPLIFIED CONDITION SYSTEM - 3 questions that auto-calculate condition
# Question answers: 0 = none, 1 = some, 2 = many
# Total score: 0-2 = Perfetto, 3-4 = Buono, 5+ = Molto Usato
CONDITION_PRICING = {
    "perfetto": 0.70,        # 70% - Perfect condition
    "buono": 0.50,           # 50% - Good condition  
    "molto_usato": 0.30      # 30% - Very used
}

def calculate_condition_from_answers(sottolineature: int, copertina: int, pagine: int, esercizi: int) -> str:
    """Calculate book condition based on 4 questions (0=none, 1=some, 2=many)"""
    total_score = sottolineature + copertina + pagine + esercizi
    if total_score <= 2:
        return "perfetto"
    elif total_score <= 5:
        return "buono"
    else:
        return "molto_usato"

# For backwards compatibility
BOOK_CONDITIONS = {
    **BOOK_CONDITIONS_OLD,
    **CONDITION_PRICING
}

def generate_username():
    """Generate anonymous username like Utente_A7K3X"""
    chars = string.ascii_uppercase + string.digits
    random_part = ''.join(random.choices(chars, k=5))
    return f"Utente_{random_part}"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

# User Models

# Child profile for multi-profile support
class ChildProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome_figlio: str  # Child's name (optional, for parent reference)
    scuola: str
    classe: str
    sezione: str
    tipo_scuola: str  # primo_grado or secondo_grado

class UserCreate(BaseModel):
    nome: str
    cognome: str
    email: str
    telefono: str
    password: str
    scuola: str
    classe: str
    sezione: str
    tipo_scuola: Optional[str] = None  # primo_grado or secondo_grado

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    cognome: str
    email: str
    telefono: str
    password_hash: str
    scuola: str
    classe: str
    sezione: str
    tipo_scuola: Optional[str] = None  # primo_grado or secondo_grado
    username: str  # Auto-generated anonymous username
    is_premium: bool = False
    premium_expires: Optional[datetime] = None
    # Multi-profile support - additional child profiles
    profili_figli: List[dict] = []  # List of ChildProfile dicts
    active_profile_id: Optional[str] = None  # Currently selected profile
    # User statistics
    total_sales: int = 0  # Total books sold
    total_purchases: int = 0  # Total books purchased
    rating: float = 0.0  # Average rating (0-5)
    rating_count: int = 0  # Number of ratings received
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Review model
class Review(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    listing_id: str  # The transaction this review is for
    reviewer_id: str  # Who is leaving the review
    reviewee_id: str  # Who is being reviewed
    rating: int  # 1-5 stars
    comment: Optional[str] = None
    type: str  # "seller" or "buyer"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserPublic(BaseModel):
    id: str
    username: str
    scuola: str
    classe: str
    sezione: str
    is_premium: bool
    tipo_scuola: Optional[str] = None

# Book Models
class BookBase(BaseModel):
    titolo: str
    autore: Optional[str] = None  # Old format
    autori: Optional[str] = None  # MIUR format
    isbn: str
    materia: Optional[str] = None  # Old format
    disciplina: Optional[str] = None  # MIUR format
    prezzo_ministeriale: Optional[float] = None  # Old format
    prezzo_copertina: Optional[float] = None  # MIUR format
    classe: Optional[str] = None  # Which class needs this book
    tipo_scuola: Optional[str] = None  # primo_grado or secondo_grado
    editore: Optional[str] = None
    # MIUR additional fields
    sottotitolo: Optional[str] = None
    volume: Optional[str] = None
    is_volume_unico: Optional[bool] = None
    tipi_scuola: Optional[List[str]] = None
    anni_corso: Optional[List[int]] = None
    nuova_adozione: Optional[bool] = None
    perc_usato_disponibile: Optional[int] = None
    motivo_usato: Optional[str] = None
    regione: Optional[str] = None
    provincia: Optional[str] = None
    num_scuole_adottanti: Optional[int] = None

class BookCreate(BaseModel):
    titolo: str
    autore: Optional[str] = None
    isbn: str
    materia: Optional[str] = None
    prezzo_ministeriale: Optional[float] = None
    classe: Optional[str] = None
    tipo_scuola: Optional[str] = None
    editore: Optional[str] = None

class Book(BookBase):
    id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: Optional[datetime] = Field(default_factory=datetime.utcnow)
    
    # Helper properties to get values regardless of format
    @property
    def get_autore(self) -> str:
        return self.autore or self.autori or "Autore non specificato"
    
    @property
    def get_materia(self) -> str:
        return self.materia or self.disciplina or "Materia non specificata"
    
    @property
    def get_prezzo(self) -> float:
        return self.prezzo_ministeriale or self.prezzo_copertina or 0.0

# Book Listing (user selling a book)
class BookConditionAnswers(BaseModel):
    """4 questions for automatic condition calculation"""
    sottolineature: int = 0  # 0=nessuna, 1=poche, 2=molte
    copertina: int = 0       # 0=no, 1=un po', 2=molto
    pagine: int = 0          # 0=nessuna, 1=qualcuna, 2=molte
    esercizi: int = 0        # 0=no, 1=qualcuno, 2=molti

class BookListingCreate(BaseModel):
    book_id: str
    condizione: Optional[str] = None  # OLD: nuovo, come_nuovo, etc. - kept for backwards compatibility
    # NEW: condition answers (if provided, will override condizione)
    condition_answers: Optional[BookConditionAnswers] = None
    note: Optional[str] = None
    foto_base64: Optional[str] = None
    # Fascicoli (workbook supplements)
    ha_fascicoli: bool = True  # Default assumes book comes with supplements
    fascicoli_totali: int = 0  # How many supplements the book should have
    fascicoli_presenti: int = 0  # How many the seller has
    # Bookstore selection for pickup - MULTIPLE selection
    bookstore_ids: List[str] = []  # List of bookstore IDs where seller can deliver

class BookListing(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    seller_id: str
    seller_username: str
    book_id: str
    book_titolo: str
    book_autore: str
    book_isbn: str
    book_materia: str
    book_classe: str
    prezzo_ministeriale: float
    condizione: str  # perfetto, buono, molto_usato (or old values)
    # Condition details from questions
    condition_details: Optional[dict] = None  # Store answers: {sottolineature, copertina, pagine, esercizi}
    prezzo_vendita: float  # Calculated based on condition
    # Fascicoli info
    ha_fascicoli: bool = True
    fascicoli_totali: int = 0
    fascicoli_presenti: int = 0
    prezzo_fascicoli: float = 0.0  # 10% of book price divided by total supplements
    # Bookstore selection - MULTIPLE bookstores where seller can deliver
    bookstore_ids: List[str] = []  # List of bookstore IDs
    bookstore_names: List[str] = []  # List of bookstore names for display
    note: Optional[str] = None
    foto_base64: Optional[str] = None
    # Stati: disponibile -> venduto -> in_consegna -> consegnato -> ritirato
    stato: str = "disponibile"
    # Tracking consegna (5 giorni per consegnare)
    data_vendita: Optional[datetime] = None  # Quando è stato venduto
    deadline_consegna: Optional[datetime] = None  # data_vendita + 5 giorni
    data_consegna: Optional[datetime] = None  # Quando il venditore ha consegnato
    data_ritiro: Optional[datetime] = None  # Quando l'acquirente ha ritirato
    # Cartolibreria scelta per il ritiro (tra quelle selezionate dal venditore)
    bookstore_ritiro_id: Optional[str] = None
    bookstore_ritiro_nome: Optional[str] = None
    # Codice transazione per ritiro
    codice_ritiro: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Book Request (user looking for a book)
class BookRequestCreate(BaseModel):
    book_id: str

class BookRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    buyer_id: str
    buyer_username: str
    book_id: str
    book_titolo: str
    book_autore: str
    book_isbn: str
    book_materia: str
    book_classe: str
    stato: str = "cercando"  # cercando, trovato
    created_at: datetime = Field(default_factory=datetime.utcnow)

# Bookstore Models
class BookstoreCreate(BaseModel):
    nome: str
    indirizzo: str
    citta: str
    telefono: str
    email: str
    password: str

class Bookstore(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    indirizzo: str
    citta: str
    telefono: str
    email: str
    password_hash: str
    affiliazione_attiva: bool = True
    affiliazione_scadenza: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class BookstorePublic(BaseModel):
    id: str
    nome: str
    indirizzo: str
    citta: str
    telefono: str

# Transaction Models
class TransactionCreate(BaseModel):
    listing_id: str
    bookstore_id: str

class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    listing_id: str
    book_titolo: str
    buyer_id: str
    buyer_username: str
    seller_id: str
    seller_username: str
    bookstore_id: str
    bookstore_nome: str
    prezzo_totale: float
    commissione_app: float  # 15% for free, 0% for premium
    commissione_cartolibreria: float  # 5%
    importo_venditore: float
    stato: str = "in_attesa_consegna"  # in_attesa_consegna, in_custodia, completato, annullato
    buyer_is_premium: bool
    created_at: datetime = Field(default_factory=datetime.utcnow)
    consegnato_il: Optional[datetime] = None
    ritirato_il: Optional[datetime] = None

# Compatibility/Match Model
class Match(BaseModel):
    listing: dict
    compatibility_score: float  # 0-100
    same_school: bool
    same_class: bool
    same_section: bool

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register")
async def register_user(user_data: UserCreate):
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    # Create user with auto-generated username
    user = User(
        nome=user_data.nome,
        cognome=user_data.cognome,
        email=user_data.email,
        telefono=user_data.telefono,
        password_hash=hash_password(user_data.password),
        scuola=user_data.scuola,
        classe=user_data.classe,
        sezione=user_data.sezione,
        tipo_scuola=user_data.tipo_scuola,
        username=generate_username()
    )
    
    await db.users.insert_one(user.dict())
    return {"message": "Registrazione completata", "user_id": user.id, "username": user.username}

@api_router.post("/auth/login")
async def login_user(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or user["password_hash"] != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    return {
        "user_id": user["id"],
        "username": user["username"],
        "nome": user["nome"],
        "is_premium": user["is_premium"],
        "scuola": user["scuola"],
        "classe": user["classe"],
        "sezione": user["sezione"]
    }

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return UserPublic(**user)

@api_router.post("/users/{user_id}/upgrade-premium")
async def upgrade_to_premium(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Set premium for 1 year
    from datetime import timedelta
    expire_date = datetime.utcnow() + timedelta(days=365)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_premium": True, "premium_expires": expire_date}}
    )
    
    return {"message": "Upgrade a Premium completato", "scadenza": expire_date}

# ============== CHILD PROFILES ROUTES ==============

class AddChildProfileRequest(BaseModel):
    nome_figlio: str
    scuola: str
    classe: str
    sezione: str
    tipo_scuola: str

@api_router.post("/users/{user_id}/profiles")
async def add_child_profile(user_id: str, profile_data: AddChildProfileRequest):
    """Add a new child profile to user account"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    new_profile = {
        "id": str(uuid.uuid4()),
        "nome_figlio": profile_data.nome_figlio,
        "scuola": profile_data.scuola,
        "classe": profile_data.classe,
        "sezione": profile_data.sezione,
        "tipo_scuola": profile_data.tipo_scuola
    }
    
    profili = user.get("profili_figli", [])
    profili.append(new_profile)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profili_figli": profili}}
    )
    
    return {"message": "Profilo figlio aggiunto", "profile": new_profile}

@api_router.get("/users/{user_id}/profiles")
async def get_child_profiles(user_id: str):
    """Get all child profiles for a user"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Include the main profile as the first one
    main_profile = {
        "id": "main",
        "nome_figlio": "Profilo principale",
        "scuola": user["scuola"],
        "classe": user["classe"],
        "sezione": user["sezione"],
        "tipo_scuola": user.get("tipo_scuola", "")
    }
    
    profiles = [main_profile] + user.get("profili_figli", [])
    return profiles

@api_router.put("/users/{user_id}/profiles/{profile_id}/activate")
async def activate_profile(user_id: str, profile_id: str):
    """Set the active profile for a user"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"active_profile_id": profile_id if profile_id != "main" else None}}
    )
    
    return {"message": "Profilo attivato", "active_profile_id": profile_id}

@api_router.delete("/users/{user_id}/profiles/{profile_id}")
async def delete_child_profile(user_id: str, profile_id: str):
    """Delete a child profile"""
    if profile_id == "main":
        raise HTTPException(status_code=400, detail="Non puoi eliminare il profilo principale")
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili = [p for p in user.get("profili_figli", []) if p["id"] != profile_id]
    
    # If deleted profile was active, reset to main
    update_fields = {"profili_figli": profili}
    if user.get("active_profile_id") == profile_id:
        update_fields["active_profile_id"] = None
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": update_fields}
    )
    
    return {"message": "Profilo eliminato"}

@api_router.get("/users/{user_id}/active-profile")
async def get_active_profile(user_id: str):
    """Get the currently active profile info for a user"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    active_id = user.get("active_profile_id")
    
    if active_id:
        for profile in user.get("profili_figli", []):
            if profile["id"] == active_id:
                return profile
    
    # Return main profile
    return {
        "id": "main",
        "nome_figlio": "Profilo principale",
        "scuola": user["scuola"],
        "classe": user["classe"],
        "sezione": user["sezione"],
        "tipo_scuola": user.get("tipo_scuola", "")
    }

# ============== BOOKS ROUTES ==============

@api_router.post("/books", response_model=Book)
async def create_book(book_data: BookCreate):
    book = Book(**book_data.dict())
    await db.books.insert_one(book.dict())
    return book

@api_router.get("/books", response_model=List[Book])
async def get_books(classe: Optional[str] = None, materia: Optional[str] = None, tipo_scuola: Optional[str] = None, limit: int = 100, skip: int = 0, search: Optional[str] = None):
    query = {}
    if classe:
        query["classe"] = classe
    if materia:
        query["materia"] = materia
    if tipo_scuola:
        query["tipo_scuola"] = tipo_scuola
    
    # If searching by ISBN (13 digits), search directly without limit
    if search and search.isdigit() and len(search) >= 10:
        # Direct ISBN search - exact match
        book = await db.books.find_one({"isbn": search})
        if book:
            return [Book(**book)]
        # Try partial match
        query["isbn"] = {"$regex": f"^{search}"}
        books = await db.books.find(query).limit(10).to_list(10)
        return [Book(**book) for book in books]
    
    if search:
        query["$or"] = [
            {"titolo": {"$regex": search, "$options": "i"}},
            {"autore": {"$regex": search, "$options": "i"}},
            {"isbn": {"$regex": search, "$options": "i"}}
        ]
    
    books = await db.books.find(query).skip(skip).limit(limit).to_list(limit)
    return [Book(**book) for book in books]

# ============== USED BOOK STATISTICS (D.P.R. 157/1989) ==============
# These routes MUST come before /books/{book_id} to avoid route conflicts

@api_router.get("/books/usato-stats")
async def get_usato_stats_route(tipo_scuola: Optional[str] = None, anno_corso: Optional[int] = None):
    """
    Get statistics on used book availability based on D.P.R. 157/1989
    (textbooks must be adopted for 3-year cycles)
    """
    query = {}
    if tipo_scuola:
        query["tipi_scuola"] = tipo_scuola
    if anno_corso:
        query["anni_corso"] = anno_corso
    
    books = await db.books.find(query).to_list(10000)
    
    if not books:
        return {
            "total_books": 0,
            "perc_usato_medio": 0,
            "perc_nuovo_medio": 100,
            "breakdown": {},
            "normativa": "D.P.R. 157/1989 - Adozioni triennali"
        }
    
    nuove_adozioni = sum(1 for b in books if b.get("perc_usato_disponibile", 0) == 0)
    volumi_unici = sum(1 for b in books if b.get("perc_usato_disponibile", 0) == 33)
    volumi_annuali = sum(1 for b in books if b.get("perc_usato_disponibile", 0) == 66)
    
    total = len(books)
    avg_usato = sum(b.get("perc_usato_disponibile", 0) for b in books) / total if total > 0 else 0
    
    return {
        "total_books": total,
        "perc_usato_medio": round(avg_usato, 1),
        "perc_nuovo_medio": round(100 - avg_usato, 1),
        "breakdown": {
            "nuove_adozioni": {
                "count": nuove_adozioni,
                "perc_totale": round(nuove_adozioni * 100 / total, 1) if total > 0 else 0,
                "perc_usato": 0,
                "descrizione": "Primo anno di adozione - nessun usato sul mercato"
            },
            "volumi_unici": {
                "count": volumi_unici,
                "perc_totale": round(volumi_unici * 100 / total, 1) if total > 0 else 0,
                "perc_usato": 33,
                "descrizione": "Volume unico per ciclo - solo chi ha terminato può vendere"
            },
            "volumi_annuali": {
                "count": volumi_annuali,
                "perc_totale": round(volumi_annuali * 100 / total, 1) if total > 0 else 0,
                "perc_usato": 66,
                "descrizione": "Volume specifico per anno - buona disponibilità usato"
            }
        },
        "normativa": "D.P.R. 157/1989 - Le adozioni dei libri di testo devono essere mantenute per almeno 3 anni"
    }


@api_router.get("/books/usato-previsione/{isbn}")
async def get_usato_prediction_route(isbn: str):
    """Get used book availability prediction for a specific ISBN"""
    book = await db.books.find_one({"isbn": isbn})
    if not book:
        raise HTTPException(status_code=404, detail="Libro non trovato nel database")
    
    book.pop("_id", None)
    
    active_listings = await db.listings.count_documents({
        "book_id": isbn,
        "stato": "disponibile"
    })
    
    perc_usato = book.get("perc_usato_disponibile", 0)
    
    # Generate advice
    if perc_usato == 0:
        consiglio = "Nuova adozione: probabilmente dovrai acquistare nuovo. Controlla comunque il Radar!"
    elif perc_usato <= 33:
        if active_listings > 0:
            consiglio = f"Volume unico ma ci sono {active_listings} annunci! Controlla subito il Radar."
        else:
            consiglio = "Volume unico: disponibilità limitata. Cerca presto per trovare usato."
    else:
        if active_listings > 0:
            consiglio = f"Buona disponibilità usato! {active_listings} annunci attivi. Ottimo momento per acquistare."
        else:
            consiglio = "Buona probabilità di trovare usato. Attiva il Radar per essere notificato."
    
    return {
        "isbn": isbn,
        "titolo": book.get("titolo", ""),
        "autori": book.get("autori", ""),
        "editore": book.get("editore", ""),
        "prezzo_copertina": book.get("prezzo_copertina", 0),
        "is_volume_unico": book.get("is_volume_unico", False),
        "nuova_adozione": book.get("nuova_adozione", False),
        "perc_usato_disponibile": perc_usato,
        "motivo_usato": book.get("motivo_usato", ""),
        "tipi_scuola": book.get("tipi_scuola", []),
        "anni_corso": book.get("anni_corso", []),
        "num_scuole_adottanti": book.get("num_scuole_adottanti", 0),
        "annunci_attivi": active_listings,
        "consiglio": consiglio
    }


@api_router.get("/books/{book_id}", response_model=Book)
async def get_book(book_id: str):
    book = await db.books.find_one({"id": book_id})
    if not book:
        raise HTTPException(status_code=404, detail="Libro non trovato")
    return Book(**book)

@api_router.get("/books/search/{isbn}")
async def search_book_by_isbn(isbn: str):
    book = await db.books.find_one({"isbn": isbn})
    if not book:
        raise HTTPException(status_code=404, detail="Libro non trovato")
    return Book(**book)

# ============== BOOK LISTINGS ROUTES ==============

@api_router.post("/listings")
async def create_listing(listing_data: BookListingCreate, user_id: str):
    # Get user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get book
    book = await db.books.find_one({"id": listing_data.book_id})
    if not book:
        raise HTTPException(status_code=404, detail="Libro non trovato")
    
    # Check if book is from user's class or requires Premium
    # Get active profile (could be main or child profile)
    active_profile_id = user.get("active_profile_id")
    if active_profile_id:
        for profile in user.get("profili_figli", []):
            if profile["id"] == active_profile_id:
                user_classe = profile["classe"]
                user_tipo_scuola = profile["tipo_scuola"]
                break
        else:
            user_classe = user["classe"]
            user_tipo_scuola = user.get("tipo_scuola", "")
    else:
        user_classe = user["classe"]
        user_tipo_scuola = user.get("tipo_scuola", "")
    
    book_classe = book.get("classe", "")
    book_tipo_scuola = book.get("tipo_scuola", "")
    
    # Check if selling from different class
    is_different_class = str(user_classe) != str(book_classe) or user_tipo_scuola != book_tipo_scuola
    
    if is_different_class and not user.get("is_premium", False):
        raise HTTPException(
            status_code=403, 
            detail="Per vendere libri di altre classi devi essere Premium (€9,90/anno). Vai al tuo profilo per l'upgrade."
        )
    
    # Determine condition and price
    condition_details = None
    condizione = listing_data.condizione
    
    # NEW SYSTEM: If condition_answers provided, calculate condition automatically
    if listing_data.condition_answers:
        ca = listing_data.condition_answers
        condizione = calculate_condition_from_answers(
            ca.sottolineature, ca.copertina, ca.pagine, ca.esercizi
        )
        condition_details = {
            "sottolineature": ca.sottolineature,
            "copertina": ca.copertina,
            "pagine": ca.pagine,
            "esercizi": ca.esercizi
        }
        
        # If missing supplements, downgrade to "molto_usato"
        if listing_data.ha_fascicoli and listing_data.fascicoli_totali > 0:
            if listing_data.fascicoli_presenti < listing_data.fascicoli_totali:
                condizione = "molto_usato"
    
    # Validate condition
    if condizione not in BOOK_CONDITIONS:
        raise HTTPException(status_code=400, detail="Condizione non valida")
    
    # Calculate base price based on condition
    prezzo_vendita = book["prezzo_ministeriale"] * BOOK_CONDITIONS[condizione]
    
    # Calculate supplement price (10% of book price for all supplements)
    prezzo_fascicoli = 0.0
    if listing_data.fascicoli_totali > 0:
        prezzo_totale_fascicoli = book["prezzo_ministeriale"] * 0.10
        if listing_data.fascicoli_presenti > 0:
            prezzo_fascicoli = round((prezzo_totale_fascicoli / listing_data.fascicoli_totali) * listing_data.fascicoli_presenti, 2)
    
    # Get bookstore names for multiple selection
    bookstore_names = []
    if listing_data.bookstore_ids:
        for bs_id in listing_data.bookstore_ids:
            bookstore = await db.bookstores.find_one({"id": bs_id})
            if bookstore:
                bookstore_names.append(bookstore["nome"])
    
    listing = BookListing(
        seller_id=user_id,
        seller_username=user["username"],
        book_id=book["id"],
        book_titolo=book["titolo"],
        book_autore=book["autore"],
        book_isbn=book["isbn"],
        book_materia=book["materia"],
        book_classe=book["classe"],
        prezzo_ministeriale=book["prezzo_ministeriale"],
        condizione=condizione,
        condition_details=condition_details,
        prezzo_vendita=round(prezzo_vendita, 2),
        ha_fascicoli=listing_data.ha_fascicoli,
        fascicoli_totali=listing_data.fascicoli_totali,
        fascicoli_presenti=listing_data.fascicoli_presenti,
        prezzo_fascicoli=prezzo_fascicoli,
        bookstore_ids=listing_data.bookstore_ids,
        bookstore_names=bookstore_names,
        note=listing_data.note,
        foto_base64=listing_data.foto_base64
    )
    
    await db.listings.insert_one(listing.dict())
    return listing

@api_router.get("/listings")
async def get_listings(classe: Optional[str] = None, materia: Optional[str] = None, stato: str = "disponibile", limit: int = 50, skip: int = 0):
    query = {"stato": stato}
    if classe:
        query["book_classe"] = classe
    if materia:
        query["book_materia"] = materia
    
    # Exclude foto_base64 from list view to reduce payload
    projection = {"foto_base64": 0}
    listings = await db.listings.find(query, projection).skip(skip).limit(limit).to_list(limit)
    # Remove MongoDB _id field to prevent serialization issues
    for listing in listings:
        listing.pop('_id', None)
    return listings

@api_router.get("/listings/user/{user_id}")
async def get_user_listings(user_id: str, limit: int = 50):
    # Exclude foto_base64 from list view
    projection = {"foto_base64": 0}
    listings = await db.listings.find({"seller_id": user_id}, projection).limit(limit).to_list(limit)
    # Remove MongoDB _id field to prevent serialization issues
    for listing in listings:
        listing.pop('_id', None)
    return listings

@api_router.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user_id: str):
    listing = await db.listings.find_one({"id": listing_id, "seller_id": user_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    if listing["stato"] != "disponibile":
        raise HTTPException(status_code=400, detail="Non puoi eliminare un annuncio già prenotato")
    
    await db.listings.delete_one({"id": listing_id})
    return {"message": "Annuncio eliminato"}

# ============== BOOK REQUESTS ROUTES ==============

@api_router.post("/requests")
async def create_request(request_data: BookRequestCreate, user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    book = await db.books.find_one({"id": request_data.book_id})
    if not book:
        raise HTTPException(status_code=404, detail="Libro non trovato")
    
    book_request = BookRequest(
        buyer_id=user_id,
        buyer_username=user["username"],
        book_id=book["id"],
        book_titolo=book["titolo"],
        book_autore=book["autore"],
        book_isbn=book["isbn"],
        book_materia=book["materia"],
        book_classe=book["classe"]
    )
    
    await db.requests.insert_one(book_request.dict())
    return book_request

@api_router.get("/requests/user/{user_id}")
async def get_user_requests(user_id: str):
    requests = await db.requests.find({"buyer_id": user_id}).to_list(100)
    # Remove MongoDB _id field to prevent serialization issues
    for req in requests:
        req.pop('_id', None)
    return requests

# ============== COMPATIBILITY/MATCHING ROUTES ==============

@api_router.get("/matches/{user_id}")
async def get_matches(user_id: str, limit: int = 50):
    """Find compatible listings based on user's book requests"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get user's book requests
    user_requests = await db.requests.find({"buyer_id": user_id, "stato": "cercando"}).to_list(50)
    
    if not user_requests:
        return {"matches": [], "total": 0}
    
    # Get book IDs user is looking for
    wanted_book_ids = [req["book_id"] for req in user_requests]
    
    # Use aggregation with $lookup to avoid N+1 queries
    pipeline = [
        {
            "$match": {
                "book_id": {"$in": wanted_book_ids},
                "seller_id": {"$ne": user_id},
                "stato": "disponibile"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "seller_id",
                "foreignField": "id",
                "as": "seller_info"
            }
        },
        {"$unwind": "$seller_info"},
        {"$project": {"foto_base64": 0, "seller_info.password_hash": 0, "seller_info.email": 0, "seller_info.telefono": 0}},
        {"$limit": limit}
    ]
    
    listings = await db.listings.aggregate(pipeline).to_list(limit)
    
    matches = []
    for listing in listings:
        listing.pop('_id', None)
        seller = listing.pop('seller_info', {})
        
        same_school = seller.get("scuola") == user["scuola"]
        same_class = seller.get("classe") == user["classe"]
        same_section = seller.get("sezione") == user["sezione"]
        
        # Score: same section = 100, same class = 80, same school = 60, other = 40
        if same_section and same_class and same_school:
            score = 100
        elif same_class and same_school:
            score = 80
        elif same_school:
            score = 60
        else:
            score = 40
        
        matches.append({
            "listing": listing,
            "compatibility_score": score,
            "same_school": same_school,
            "same_class": same_class,
            "same_section": same_section
        })
    
    # Sort by compatibility score
    matches.sort(key=lambda x: x["compatibility_score"], reverse=True)
    
    return {"matches": matches, "total": len(matches)}


@api_router.get("/radar/{user_id}")
async def get_radar_view(user_id: str):
    """Get a summary view of all compatibilities for the radar"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get user's requests
    user_requests = await db.requests.find({"buyer_id": user_id, "stato": "cercando"}).to_list(50)
    wanted_book_ids = [req["book_id"] for req in user_requests]
    
    if not wanted_book_ids:
        return {
            "total_matches": 0,
            "same_section": 0,
            "same_class": 0,
            "same_school": 0,
            "others": 0,
            "books_searching": 0
        }
    
    # Use aggregation with $lookup to avoid N+1 queries
    pipeline = [
        {
            "$match": {
                "book_id": {"$in": wanted_book_ids},
                "seller_id": {"$ne": user_id},
                "stato": "disponibile"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "seller_id",
                "foreignField": "id",
                "as": "seller_info"
            }
        },
        {"$unwind": "$seller_info"},
        {
            "$project": {
                "seller_scuola": "$seller_info.scuola",
                "seller_classe": "$seller_info.classe",
                "seller_sezione": "$seller_info.sezione"
            }
        }
    ]
    
    listings = await db.listings.aggregate(pipeline).to_list(200)
    
    # Count matches by category
    same_section = 0
    same_class = 0
    same_school = 0
    others = 0
    
    for listing in listings:
        if (listing.get("seller_sezione") == user["sezione"] and 
            listing.get("seller_classe") == user["classe"] and 
            listing.get("seller_scuola") == user["scuola"]):
            same_section += 1
        elif (listing.get("seller_classe") == user["classe"] and 
              listing.get("seller_scuola") == user["scuola"]):
            same_class += 1
        elif listing.get("seller_scuola") == user["scuola"]:
            same_school += 1
        else:
            others += 1
    
    return {
        "total_matches": len(listings),
        "same_section": same_section,
        "same_class": same_class,
        "same_school": same_school,
        "others": others,
        "books_searching": len(user_requests)
    }


@api_router.get("/radar/{user_id}/class-compatibility")
async def get_class_compatibility(user_id: str):
    """
    Get cross-class book compatibility based on D.P.R. 157/1989
    Shows which books from other classes could be useful for the user
    """
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    user_classe = int(user.get("classe", 1))
    user_scuola = user.get("scuola", "")
    user_tipo = user.get("tipo_scuola", "primo_grado")
    
    # Define which classes to check based on user's class
    # For middle school: 1, 2, 3
    # For high school biennio: 1, 2
    # For high school triennio: 3, 4, 5
    if user_tipo == "primo_grado":
        all_classes = [1, 2, 3]
    else:
        all_classes = [1, 2, 3, 4, 5]
    
    other_classes = [c for c in all_classes if c != user_classe]
    
    # Find all available listings from the same school but different classes
    pipeline = [
        {
            "$match": {
                "seller_id": {"$ne": user_id},
                "stato": "disponibile"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "seller_id",
                "foreignField": "id",
                "as": "seller_info"
            }
        },
        {"$unwind": "$seller_info"},
        {
            "$match": {
                "seller_info.scuola": user_scuola,
                "seller_info.classe": {"$in": [str(c) for c in other_classes]}
            }
        }
    ]
    
    listings = await db.listings.aggregate(pipeline).to_list(500)
    
    # Organize by class
    class_data = {}
    for c in other_classes:
        class_data[str(c)] = {
            "classe": c,
            "sellers_count": 0,
            "books_count": 0,
            "usable_for_you": 0,  # Books you could use (volume unico or matching anno)
            "total_value": 0,
            "usato_medio": 0,
            "sellers": {},
            "books": []
        }
    
    for listing in listings:
        seller = listing.get("seller_info", {})
        seller_classe = seller.get("classe", "1")
        
        if seller_classe not in class_data:
            continue
        
        cd = class_data[seller_classe]
        seller_id = seller.get("id")
        
        # Track unique sellers
        if seller_id not in cd["sellers"]:
            cd["sellers"][seller_id] = {
                "username": seller.get("username", ""),
                "sezione": seller.get("sezione", ""),
                "books_count": 0
            }
            cd["sellers_count"] += 1
        
        cd["sellers"][seller_id]["books_count"] += 1
        cd["books_count"] += 1
        cd["total_value"] += listing.get("prezzo_vendita", 0)
        
        # Check if book is usable for the user
        # Volume unico = usable by all classes in the cycle
        # Otherwise check if the book's anni_corso includes user's class
        is_volume_unico = listing.get("is_volume_unico", False)
        anni_corso = listing.get("anni_corso", [])
        
        is_usable = is_volume_unico or user_classe in anni_corso
        
        if is_usable:
            cd["usable_for_you"] += 1
        
        # Add book info
        cd["books"].append({
            "listing_id": listing.get("id"),
            "titolo": listing.get("book_titolo", "")[:50],
            "prezzo_vendita": listing.get("prezzo_vendita", 0),
            "condizione": listing.get("condizione", ""),
            "is_volume_unico": is_volume_unico,
            "anni_corso": anni_corso,
            "is_usable_for_you": is_usable,
            "perc_usato": listing.get("perc_usato_disponibile", 0),
            "seller_username": seller.get("username", "")
        })
    
    # Calculate averages and format response
    result = {
        "user_classe": user_classe,
        "user_scuola": user_scuola,
        "classes": []
    }
    
    for c in sorted(other_classes):
        cd = class_data[str(c)]
        if cd["books_count"] > 0:
            cd["usato_medio"] = sum(b["perc_usato"] for b in cd["books"]) / cd["books_count"]
        
        # Calculate compatibility percentage
        if cd["books_count"] > 0:
            compatibility = round((cd["usable_for_you"] / cd["books_count"]) * 100, 1)
        else:
            compatibility = 0
        
        # Determine class relationship
        if c < user_classe:
            relationship = "precedente"
            relationship_desc = f"Studenti di {c}ª che hanno già usato questi libri"
        else:
            relationship = "successiva"
            relationship_desc = f"Studenti di {c}ª che non useranno più questi libri"
        
        result["classes"].append({
            "classe": c,
            "relationship": relationship,
            "relationship_desc": relationship_desc,
            "sellers_count": cd["sellers_count"],
            "books_count": cd["books_count"],
            "usable_for_you": cd["usable_for_you"],
            "compatibility_percentage": compatibility,
            "total_value": round(cd["total_value"], 2),
            "usato_medio_percentage": round(cd["usato_medio"], 1),
            "top_sellers": [
                {
                    "username": s["username"],
                    "sezione": s["sezione"],
                    "books_count": s["books_count"]
                }
                for s in sorted(cd["sellers"].values(), key=lambda x: -x["books_count"])[:3]
            ],
            "sample_books": sorted(cd["books"], key=lambda x: -x["is_usable_for_you"])[:5]
        })
    
    # Add summary
    total_usable = sum(c["usable_for_you"] for c in result["classes"])
    total_books = sum(c["books_count"] for c in result["classes"])
    
    result["summary"] = {
        "total_sellers": sum(c["sellers_count"] for c in result["classes"]),
        "total_books_available": total_books,
        "total_usable_for_you": total_usable,
        "overall_compatibility": round((total_usable / total_books * 100), 1) if total_books > 0 else 0,
        "message": _get_compatibility_message(user_classe, result["classes"])
    }
    
    return result


def _get_compatibility_message(user_classe: int, classes_data: list) -> str:
    """Generate a helpful message about cross-class compatibility"""
    usable_books = sum(c["usable_for_you"] for c in classes_data)
    
    if usable_books == 0:
        return "Nessun libro compatibile trovato al momento. Attiva il Radar per essere notificato!"
    
    from_lower = sum(c["usable_for_you"] for c in classes_data if c["classe"] < user_classe)
    from_higher = sum(c["usable_for_you"] for c in classes_data if c["classe"] > user_classe)
    
    messages = []
    if from_lower > 0:
        messages.append(f"{from_lower} libri da classi precedenti (già usati, ottimo usato!)")
    if from_higher > 0:
        messages.append(f"{from_higher} libri da classi successive (volumi unici)")
    
    return " • ".join(messages)


@api_router.get("/radar/{user_id}/sellers")
async def get_radar_sellers(user_id: str, filter_type: Optional[str] = None):
    """Get list of sellers with their books that match user's wanted books"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get user's requests
    user_requests = await db.requests.find({"buyer_id": user_id, "stato": "cercando"}).to_list(50)
    wanted_book_ids = [req["book_id"] for req in user_requests]
    
    if not wanted_book_ids:
        return []
    
    # Find all available listings for wanted books
    pipeline = [
        {
            "$match": {
                "book_id": {"$in": wanted_book_ids},
                "seller_id": {"$ne": user_id},
                "stato": "disponibile"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "seller_id",
                "foreignField": "id",
                "as": "seller_info"
            }
        },
        {"$unwind": "$seller_info"},
        {
            "$group": {
                "_id": "$seller_id",
                "seller_username": {"$first": "$seller_info.username"},
                "seller_scuola": {"$first": "$seller_info.scuola"},
                "seller_classe": {"$first": "$seller_info.classe"},
                "seller_sezione": {"$first": "$seller_info.sezione"},
                "books_count": {"$sum": 1},
                "total_price": {"$sum": "$prezzo_vendita"},
                "books": {
                    "$push": {
                        "listing_id": "$id",
                        "book_id": "$book_id",
                        "titolo": "$book_titolo",
                        "autore": "$book_autore",
                        "prezzo_vendita": "$prezzo_vendita",
                        "condizione": "$condizione",
                        "condition_details": "$condition_details"
                    }
                }
            }
        },
        {"$sort": {"books_count": -1}}
    ]
    
    sellers = await db.listings.aggregate(pipeline).to_list(50)
    
    # Categorize and filter sellers
    result = []
    for seller in sellers:
        category = "altri"
        if (seller.get("seller_sezione") == user["sezione"] and 
            seller.get("seller_classe") == user["classe"] and 
            seller.get("seller_scuola") == user["scuola"]):
            category = "stessa_sezione"
        elif (seller.get("seller_classe") == user["classe"] and 
              seller.get("seller_scuola") == user["scuola"]):
            category = "stessa_classe"
        elif seller.get("seller_scuola") == user["scuola"]:
            category = "stessa_scuola"
        
        # Apply filter if provided
        if filter_type and filter_type != category:
            continue
            
        result.append({
            "seller_id": seller["_id"],
            "seller_username": seller["seller_username"],
            "scuola": seller["seller_scuola"],
            "classe": seller["seller_classe"],
            "sezione": seller["seller_sezione"],
            "category": category,
            "books_count": seller["books_count"],
            "total_price": round(seller["total_price"], 2),
            "books": seller["books"][:10]  # Limit books per seller
        })
    
    return result

@api_router.get("/seller/{seller_id}/listings")
async def get_seller_listings(seller_id: str, buyer_id: Optional[str] = None):
    """Get all listings from a specific seller"""
    seller = await db.users.find_one({"id": seller_id})
    if not seller:
        raise HTTPException(status_code=404, detail="Venditore non trovato")
    
    # Get all available listings from this seller
    listings = await db.listings.find({
        "seller_id": seller_id,
        "stato": "disponibile"
    }).to_list(50)
    
    # If buyer_id provided, mark which books they want
    wanted_book_ids = []
    if buyer_id:
        requests = await db.requests.find({"buyer_id": buyer_id, "stato": "cercando"}).to_list(50)
        wanted_book_ids = [req["book_id"] for req in requests]
    
    result = []
    for listing in listings:
        listing.pop('_id', None)
        listing.pop('foto_base64', None)  # Don't send photo in list
        listing["is_wanted"] = listing["book_id"] in wanted_book_ids
        result.append(listing)
    
    # Sort: wanted books first
    result.sort(key=lambda x: (not x["is_wanted"], x["book_titolo"]))
    
    return {
        "seller": {
            "id": seller_id,
            "username": seller["username"],
            "scuola": seller["scuola"],
            "classe": seller["classe"],
            "sezione": seller["sezione"]
        },
        "listings": result
    }

# ============== TRANSACTION & DELIVERY ROUTES ==============

import random
import string

def generate_pickup_code():
    """Generate a unique 6-character pickup code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

class PurchaseRequest(BaseModel):
    listing_id: str
    bookstore_id: str  # Which bookstore the buyer wants to pick up from

@api_router.post("/purchase")
async def purchase_book(purchase_data: PurchaseRequest, buyer_id: str):
    """Buyer initiates purchase of a book"""
    from datetime import timedelta
    
    # Get listing
    listing = await db.listings.find_one({"id": purchase_data.listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    if listing["stato"] != "disponibile":
        raise HTTPException(status_code=400, detail="Libro non più disponibile")
    
    # Verify bookstore is in seller's list
    if purchase_data.bookstore_id not in listing.get("bookstore_ids", []):
        raise HTTPException(status_code=400, detail="Cartolibreria non disponibile per questo annuncio")
    
    # Get buyer
    buyer = await db.users.find_one({"id": buyer_id})
    if not buyer:
        raise HTTPException(status_code=404, detail="Acquirente non trovato")
    
    # Can't buy your own book
    if listing["seller_id"] == buyer_id:
        raise HTTPException(status_code=400, detail="Non puoi acquistare il tuo stesso libro")
    
    # Get bookstore name
    bookstore = await db.bookstores.find_one({"id": purchase_data.bookstore_id})
    bookstore_nome = bookstore["nome"] if bookstore else ""
    
    # Generate pickup code
    codice_ritiro = generate_pickup_code()
    
    # Calculate deadline (5 days from now)
    now = datetime.utcnow()
    deadline = now + timedelta(days=5)
    
    # Update listing
    await db.listings.update_one(
        {"id": purchase_data.listing_id},
        {"$set": {
            "stato": "venduto",
            "data_vendita": now,
            "deadline_consegna": deadline,
            "bookstore_ritiro_id": purchase_data.bookstore_id,
            "bookstore_ritiro_nome": bookstore_nome,
            "codice_ritiro": codice_ritiro,
            "buyer_id": buyer_id,
            "buyer_username": buyer["username"]
        }}
    )
    
    return {
        "message": "Acquisto confermato!",
        "codice_ritiro": codice_ritiro,
        "deadline_consegna": deadline.isoformat(),
        "bookstore": bookstore_nome,
        "prezzo": listing["prezzo_vendita"]
    }

@api_router.post("/listings/{listing_id}/mark-delivered")
async def mark_as_delivered(listing_id: str, seller_id: str):
    """Seller marks the book as delivered to the bookstore"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    if listing["seller_id"] != seller_id:
        raise HTTPException(status_code=403, detail="Non sei il venditore di questo libro")
    
    if listing["stato"] != "venduto":
        raise HTTPException(status_code=400, detail="Il libro deve essere prima venduto")
    
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {
            "stato": "consegnato",
            "data_consegna": datetime.utcnow()
        }}
    )
    
    return {"message": "Libro segnato come consegnato alla cartolibreria"}

@api_router.post("/listings/{listing_id}/confirm-pickup")
async def confirm_pickup(listing_id: str, buyer_id: str, codice: str):
    """Buyer confirms pickup with the pickup code"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    if listing.get("buyer_id") != buyer_id:
        raise HTTPException(status_code=403, detail="Non sei l'acquirente di questo libro")
    
    if listing["stato"] != "consegnato":
        raise HTTPException(status_code=400, detail="Il libro non è ancora stato consegnato")
    
    if listing.get("codice_ritiro") != codice:
        raise HTTPException(status_code=400, detail="Codice di ritiro non valido")
    
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {
            "stato": "ritirato",
            "data_ritiro": datetime.utcnow()
        }}
    )
    
    # TODO: Here we would release the payment to the seller
    
    return {"message": "Ritiro confermato! Transazione completata."}

@api_router.get("/listings/{listing_id}/delivery-status")
async def get_delivery_status(listing_id: str):
    """Get the delivery status of a listing"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    # Remove sensitive data
    listing.pop('_id', None)
    listing.pop('foto_base64', None)
    
    # Calculate days remaining
    days_remaining = None
    if listing.get("deadline_consegna"):
        deadline = listing["deadline_consegna"]
        if isinstance(deadline, str):
            deadline = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
        days_remaining = (deadline - datetime.utcnow()).days
        if days_remaining < 0:
            days_remaining = 0
    
    return {
        "listing": listing,
        "days_remaining": days_remaining
    }

@api_router.get("/user/{user_id}/sales")
async def get_user_sales(user_id: str):
    """Get all books the user is selling or has sold"""
    listings = await db.listings.find({"seller_id": user_id}).to_list(100)
    
    result = []
    for listing in listings:
        listing.pop('_id', None)
        listing.pop('foto_base64', None)
        
        # Calculate days remaining for active sales
        days_remaining = None
        if listing.get("deadline_consegna") and listing["stato"] == "venduto":
            deadline = listing["deadline_consegna"]
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
            days_remaining = (deadline - datetime.utcnow()).days
            if days_remaining < 0:
                days_remaining = 0
        
        listing["days_remaining"] = days_remaining
        result.append(listing)
    
    return result

@api_router.get("/user/{user_id}/purchases")
async def get_user_purchases(user_id: str):
    """Get all books the user has purchased"""
    listings = await db.listings.find({"buyer_id": user_id}).to_list(100)
    
    for listing in listings:
        listing.pop('_id', None)
        listing.pop('foto_base64', None)
    
    return listings

# ============== BOOKSTORE ROUTES ==============

@api_router.post("/bookstores/register")
async def register_bookstore(bookstore_data: BookstoreCreate):
    existing = await db.bookstores.find_one({"email": bookstore_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    from datetime import timedelta
    bookstore = Bookstore(
        nome=bookstore_data.nome,
        indirizzo=bookstore_data.indirizzo,
        citta=bookstore_data.citta,
        telefono=bookstore_data.telefono,
        email=bookstore_data.email,
        password_hash=hash_password(bookstore_data.password),
        affiliazione_scadenza=datetime.utcnow() + timedelta(days=365)
    )
    
    await db.bookstores.insert_one(bookstore.dict())
    return {"message": "Cartolibreria registrata", "id": bookstore.id}

@api_router.post("/bookstores/login")
async def login_bookstore(credentials: UserLogin):
    bookstore = await db.bookstores.find_one({"email": credentials.email})
    if not bookstore or bookstore["password_hash"] != hash_password(credentials.password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    return {
        "bookstore_id": bookstore["id"],
        "nome": bookstore["nome"],
        "affiliazione_attiva": bookstore["affiliazione_attiva"]
    }

@api_router.get("/bookstores", response_model=List[BookstorePublic])
async def get_bookstores(citta: Optional[str] = None):
    query = {"affiliazione_attiva": True}
    if citta:
        query["citta"] = citta
    
    bookstores = await db.bookstores.find(query).to_list(100)
    return [BookstorePublic(**b) for b in bookstores]

@api_router.get("/bookstores/{bookstore_id}/transactions")
async def get_bookstore_transactions(bookstore_id: str):
    transactions = await db.transactions.find({"bookstore_id": bookstore_id}).to_list(100)
    # Remove MongoDB _id field to prevent serialization issues
    for transaction in transactions:
        transaction.pop('_id', None)
    return transactions

@api_router.post("/bookstores/{bookstore_id}/confirm-delivery/{transaction_id}")
async def confirm_book_delivery(bookstore_id: str, transaction_id: str):
    """Bookstore confirms they received the book from seller"""
    transaction = await db.transactions.find_one({"id": transaction_id, "bookstore_id": bookstore_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transazione non trovata")
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"stato": "in_custodia", "consegnato_il": datetime.utcnow()}}
    )
    
    return {"message": "Consegna confermata, libro in custodia"}

@api_router.post("/bookstores/{bookstore_id}/confirm-pickup/{transaction_id}")
async def confirm_book_pickup(bookstore_id: str, transaction_id: str, buyer_name: str):
    """Bookstore confirms buyer picked up the book"""
    transaction = await db.transactions.find_one({"id": transaction_id, "bookstore_id": bookstore_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transazione non trovata")
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {
            "stato": "completato",
            "ritirato_il": datetime.utcnow(),
            "ritirato_da": buyer_name
        }}
    )
    
    # Update listing status
    await db.listings.update_one(
        {"id": transaction["listing_id"]},
        {"$set": {"stato": "venduto"}}
    )
    
    return {"message": "Ritiro confermato, transazione completata"}

# ============== TRANSACTION ROUTES ==============

@api_router.post("/transactions")
async def create_transaction(transaction_data: TransactionCreate, user_id: str):
    """Create a purchase transaction (only for premium users or with commission)"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    listing = await db.listings.find_one({"id": transaction_data.listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    if listing["stato"] != "disponibile":
        raise HTTPException(status_code=400, detail="Libro non più disponibile")
    
    bookstore = await db.bookstores.find_one({"id": transaction_data.bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Calculate commissions
    prezzo = listing["prezzo_vendita"]
    is_premium = user["is_premium"]
    
    if is_premium:
        # Premium: 0% commission
        commissione_app = 0
        commissione_cartolibreria = prezzo * 0.05  # 5% to bookstore (paid by app from subscription revenue)
        importo_venditore = prezzo
    else:
        # Free: 15% total commission (10% app + 5% bookstore)
        commissione_totale = prezzo * 0.15
        commissione_cartolibreria = prezzo * 0.05
        commissione_app = commissione_totale - commissione_cartolibreria
        importo_venditore = prezzo - commissione_totale
    
    transaction = Transaction(
        listing_id=listing["id"],
        book_titolo=listing["book_titolo"],
        buyer_id=user_id,
        buyer_username=user["username"],
        seller_id=listing["seller_id"],
        seller_username=listing["seller_username"],
        bookstore_id=bookstore["id"],
        bookstore_nome=bookstore["nome"],
        prezzo_totale=prezzo,
        commissione_app=round(commissione_app, 2),
        commissione_cartolibreria=round(commissione_cartolibreria, 2),
        importo_venditore=round(importo_venditore, 2),
        buyer_is_premium=is_premium
    )
    
    await db.transactions.insert_one(transaction.dict())
    
    # Update listing status
    await db.listings.update_one(
        {"id": listing["id"]},
        {"$set": {"stato": "prenotato"}}
    )
    
    return transaction

@api_router.get("/transactions/user/{user_id}")
async def get_user_transactions(user_id: str):
    # Get both as buyer and seller
    as_buyer = await db.transactions.find({"buyer_id": user_id}).to_list(100)
    as_seller = await db.transactions.find({"seller_id": user_id}).to_list(100)
    
    # Remove MongoDB _id field to prevent serialization issues
    for transaction in as_buyer:
        transaction.pop('_id', None)
    for transaction in as_seller:
        transaction.pop('_id', None)
    
    return {
        "acquisti": as_buyer,
        "vendite": as_seller
    }

@api_router.post("/transactions/{transaction_id}/confirm")
async def confirm_transaction(transaction_id: str, user_id: str):
    """Buyer confirms the book is OK after pickup"""
    transaction = await db.transactions.find_one({"id": transaction_id, "buyer_id": user_id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transazione non trovata")
    
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": {"stato": "completato", "ritirato_il": datetime.utcnow()}}
    )
    
    return {"message": "Transazione completata con successo"}

# ============== ADMIN ROUTES ==============

@api_router.get("/admin/stats")
async def get_admin_stats():
    """Get admin dashboard statistics"""
    users_count = await db.users.count_documents({})
    premium_count = await db.users.count_documents({"is_premium": True})
    books_count = await db.books.count_documents({})
    listings_count = await db.listings.count_documents({})
    listings_available = await db.listings.count_documents({"stato": "disponibile"})
    listings_sold = await db.listings.count_documents({"stato": {"$in": ["venduto", "consegnato", "ritirato"]}})
    transactions_count = await db.transactions.count_documents({})
    bookstores_count = await db.bookstores.count_documents({})
    
    # Calculate revenue
    completed_transactions = await db.transactions.find({"stato": "completato"}).to_list(1000)
    total_revenue = sum(t.get("commissione_app", 0) for t in completed_transactions)
    
    return {
        "users": {
            "total": users_count,
            "premium": premium_count,
            "free": users_count - premium_count
        },
        "books": books_count,
        "listings": {
            "total": listings_count,
            "available": listings_available,
            "sold": listings_sold
        },
        "transactions": transactions_count,
        "bookstores": bookstores_count,
        "revenue": round(total_revenue, 2)
    }

@api_router.get("/admin/users")
async def get_admin_users(limit: int = 100, skip: int = 0):
    """Get list of users for admin"""
    users = await db.users.find({}).skip(skip).limit(limit).to_list(limit)
    result = []
    for user in users:
        user.pop('_id', None)
        user.pop('password_hash', None)
        result.append(user)
    return result

@api_router.get("/admin/transactions")
async def get_admin_transactions(limit: int = 100):
    """Get recent transactions for admin"""
    # Get listings with completed sales
    listings = await db.listings.find({
        "stato": {"$in": ["venduto", "consegnato", "ritirato"]}
    }).sort("data_vendita", -1).limit(limit).to_list(limit)
    
    result = []
    for listing in listings:
        listing.pop('_id', None)
        listing.pop('foto_base64', None)
        result.append(listing)
    return result

@api_router.post("/admin/users/{user_id}/toggle-premium")
async def admin_toggle_premium(user_id: str):
    """Admin toggle user premium status"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    new_status = not user.get("is_premium", False)
    
    from datetime import timedelta
    update = {"is_premium": new_status}
    if new_status:
        update["premium_expires"] = datetime.utcnow() + timedelta(days=365)
    
    await db.users.update_one({"id": user_id}, {"$set": update})
    
    return {"message": f"Utente ora è {'Premium' if new_status else 'Free'}", "is_premium": new_status}

# ============== REVIEW ROUTES ==============

class ReviewCreate(BaseModel):
    listing_id: str
    rating: int  # 1-5
    comment: Optional[str] = None

@api_router.post("/reviews")
async def create_review(review_data: ReviewCreate, reviewer_id: str):
    """Create a review for a completed transaction"""
    # Get listing
    listing = await db.listings.find_one({"id": review_data.listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Transazione non trovata")
    
    if listing.get("stato") != "ritirato":
        raise HTTPException(status_code=400, detail="Puoi recensire solo transazioni completate")
    
    # Determine who is being reviewed
    seller_id = listing["seller_id"]
    buyer_id = listing.get("buyer_id")
    
    if reviewer_id == seller_id:
        # Seller reviewing buyer
        reviewee_id = buyer_id
        review_type = "buyer"
    elif reviewer_id == buyer_id:
        # Buyer reviewing seller
        reviewee_id = seller_id
        review_type = "seller"
    else:
        raise HTTPException(status_code=403, detail="Non sei parte di questa transazione")
    
    # Check if already reviewed
    existing = await db.reviews.find_one({
        "listing_id": review_data.listing_id,
        "reviewer_id": reviewer_id
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hai già recensito questa transazione")
    
    # Validate rating
    if review_data.rating < 1 or review_data.rating > 5:
        raise HTTPException(status_code=400, detail="Rating deve essere tra 1 e 5")
    
    # Create review
    review = Review(
        listing_id=review_data.listing_id,
        reviewer_id=reviewer_id,
        reviewee_id=reviewee_id,
        rating=review_data.rating,
        comment=review_data.comment,
        type=review_type
    )
    
    await db.reviews.insert_one(review.dict())
    
    # Update reviewee's rating
    all_reviews = await db.reviews.find({"reviewee_id": reviewee_id}).to_list(100)
    avg_rating = sum(r["rating"] for r in all_reviews) / len(all_reviews)
    
    await db.users.update_one(
        {"id": reviewee_id},
        {"$set": {
            "rating": round(avg_rating, 1),
            "rating_count": len(all_reviews)
        }}
    )
    
    return {"message": "Recensione aggiunta", "review_id": review.id}

@api_router.get("/users/{user_id}/reviews")
async def get_user_reviews(user_id: str):
    """Get all reviews for a user"""
    reviews = await db.reviews.find({"reviewee_id": user_id}).to_list(100)
    
    result = []
    for review in reviews:
        review.pop('_id', None)
        # Get reviewer username
        reviewer = await db.users.find_one({"id": review["reviewer_id"]})
        if reviewer:
            review["reviewer_username"] = reviewer["username"]
        result.append(review)
    
    return result

@api_router.get("/users/{user_id}/stats")
async def get_user_stats(user_id: str):
    """Get user statistics"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Count sales
    sales = await db.listings.count_documents({
        "seller_id": user_id,
        "stato": "ritirato"
    })
    
    # Count purchases
    purchases = await db.listings.count_documents({
        "buyer_id": user_id,
        "stato": "ritirato"
    })
    
    # Count active listings
    active_listings = await db.listings.count_documents({
        "seller_id": user_id,
        "stato": "disponibile"
    })
    
    # Count pending deliveries
    pending_deliveries = await db.listings.count_documents({
        "seller_id": user_id,
        "stato": "venduto"
    })
    
    return {
        "total_sales": sales,
        "total_purchases": purchases,
        "active_listings": active_listings,
        "pending_deliveries": pending_deliveries,
        "rating": user.get("rating", 0),
        "rating_count": user.get("rating_count", 0),
        "is_premium": user.get("is_premium", False)
    }

@api_router.get("/listings/{listing_id}/can-review")
async def can_review_listing(listing_id: str, user_id: str):
    """Check if user can review this listing"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        return {"can_review": False, "reason": "Transazione non trovata"}
    
    if listing.get("stato") != "ritirato":
        return {"can_review": False, "reason": "Transazione non ancora completata"}
    
    # Check if user is part of transaction
    if user_id not in [listing.get("seller_id"), listing.get("buyer_id")]:
        return {"can_review": False, "reason": "Non sei parte di questa transazione"}
    
    # Check if already reviewed
    existing = await db.reviews.find_one({
        "listing_id": listing_id,
        "reviewer_id": user_id
    })
    if existing:
        return {"can_review": False, "reason": "Hai già recensito"}
    
    return {"can_review": True}

# ============== CHAT ROUTES ==============

# Patterns to block in chat messages
import re

BLOCKED_PATTERNS = [
    # Phone numbers (Italian and international)
    r'\+?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}[\s\-]?\d{0,4}',
    r'\d{3}[\s\-]?\d{3}[\s\-]?\d{4}',
    r'\d{10,}',
    # Email addresses
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',
    # Social media handles/keywords
    r'(?i)(instagram|facebook|whatsapp|telegram|messenger|twitter|tiktok|snapchat)',
    r'(?i)(ig:|fb:|wa\.me|t\.me)',
    r'@[a-zA-Z0-9_]+',
    # Common contact phrases
    r'(?i)(chiamami|contattami|scrivimi su|il mio numero|la mia mail|mio contatto)',
    r'(?i)(ci vediamo|incontriamoci|dove abiti|il tuo numero|la tua mail)',
]

def contains_blocked_content(message: str, user_nome: str = None, user_cognome: str = None) -> tuple[bool, str]:
    """Check if message contains blocked content. Returns (is_blocked, reason)"""
    
    # Check against regex patterns
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, message):
            return True, "Il messaggio contiene informazioni di contatto non permesse"
    
    # Check if message contains user's real name
    if user_nome and user_nome.lower() in message.lower():
        return True, "Non puoi condividere il tuo nome reale"
    if user_cognome and user_cognome.lower() in message.lower():
        return True, "Non puoi condividere il tuo cognome reale"
    
    return False, ""

class ChatMessageCreate(BaseModel):
    listing_id: str
    receiver_id: str
    message: Optional[str] = None
    foto_base64: Optional[str] = None

class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    listing_id: str
    sender_id: str
    sender_username: str
    receiver_id: str
    receiver_username: str
    message: Optional[str] = None
    foto_base64: Optional[str] = None
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ChatConversation(BaseModel):
    listing_id: str
    listing_title: str
    other_user_username: str
    other_user_id: str
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    unread_count: int = 0

@api_router.post("/chat/send")
async def send_chat_message(message_data: ChatMessageCreate, user_id: str):
    """Send a chat message with content filtering"""
    
    # Get sender
    sender = await db.users.find_one({"id": user_id})
    if not sender:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get receiver
    receiver = await db.users.find_one({"id": message_data.receiver_id})
    if not receiver:
        raise HTTPException(status_code=404, detail="Destinatario non trovato")
    
    # Get listing
    listing = await db.listings.find_one({"id": message_data.listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    # Check message content if present
    if message_data.message:
        is_blocked, reason = contains_blocked_content(
            message_data.message,
            sender.get("nome"),
            sender.get("cognome")
        )
        if is_blocked:
            raise HTTPException(status_code=400, detail=f"⚠️ {reason}. Per la tua sicurezza, non è possibile scambiare dati personali.")
    
    # Check that either message or photo is provided
    if not message_data.message and not message_data.foto_base64:
        raise HTTPException(status_code=400, detail="Inserisci un messaggio o una foto")
    
    # Create message
    chat_message = ChatMessage(
        listing_id=message_data.listing_id,
        sender_id=user_id,
        sender_username=sender["username"],
        receiver_id=message_data.receiver_id,
        receiver_username=receiver["username"],
        message=message_data.message,
        foto_base64=message_data.foto_base64
    )
    
    await db.chat_messages.insert_one(chat_message.dict())
    
    return {"message": "Messaggio inviato", "chat_id": chat_message.id}

@api_router.get("/chat/conversations/{user_id}")
async def get_conversations(user_id: str):
    """Get all conversations for a user"""
    
    # Find all messages where user is sender or receiver (limit to recent)
    messages = await db.chat_messages.find({
        "$or": [
            {"sender_id": user_id},
            {"receiver_id": user_id}
        ]
    }, {"foto_base64": 0}).sort("created_at", -1).to_list(200)
    
    # Group by listing and other user
    conversations = {}
    listing_cache = {}  # Cache listing lookups
    
    for msg in messages:
        msg.pop('_id', None)
        listing_id = msg["listing_id"]
        other_user_id = msg["receiver_id"] if msg["sender_id"] == user_id else msg["sender_id"]
        other_username = msg["receiver_username"] if msg["sender_id"] == user_id else msg["sender_username"]
        
        key = f"{listing_id}_{other_user_id}"
        
        if key not in conversations:
            # Get listing title (with caching)
            if listing_id not in listing_cache:
                listing = await db.listings.find_one({"id": listing_id}, {"book_titolo": 1})
                listing_cache[listing_id] = listing["book_titolo"] if listing else "Libro"
            
            conversations[key] = {
                "listing_id": listing_id,
                "listing_title": listing_cache[listing_id],
                "other_user_username": other_username,
                "other_user_id": other_user_id,
                "last_message": msg.get("message") or "📷 Foto",
                "last_message_time": msg["created_at"],
                "unread_count": 0
            }
        
        # Count unread messages
        if msg["receiver_id"] == user_id and not msg.get("read", False):
            conversations[key]["unread_count"] += 1
    
    return list(conversations.values())

@api_router.get("/chat/messages/{listing_id}/{other_user_id}")
async def get_chat_messages(listing_id: str, other_user_id: str, user_id: str, limit: int = 100):
    """Get all messages in a conversation"""
    
    messages = await db.chat_messages.find({
        "listing_id": listing_id,
        "$or": [
            {"sender_id": user_id, "receiver_id": other_user_id},
            {"sender_id": other_user_id, "receiver_id": user_id}
        ]
    }).sort("created_at", 1).to_list(limit)
    
    # Mark messages as read
    await db.chat_messages.update_many(
        {
            "listing_id": listing_id,
            "sender_id": other_user_id,
            "receiver_id": user_id,
            "read": False
        },
        {"$set": {"read": True}}
    )
    
    # Remove MongoDB _id field
    for msg in messages:
        msg.pop('_id', None)
    
    return messages

@api_router.get("/chat/unread-count/{user_id}")
async def get_unread_count(user_id: str):
    """Get total unread message count for a user"""
    count = await db.chat_messages.count_documents({
        "receiver_id": user_id,
        "read": False
    })
    return {"unread_count": count}


# ============== SEED DATA ROUTES ==============

@api_router.post("/seed/books")
async def seed_books():
    """Seed database with sample books for testing"""
    sample_books = [
        {"titolo": "Matematica Blu 2.0 Vol. 1", "autore": "Bergamini, Barozzi", "isbn": "9788808537898", "materia": "Matematica", "prezzo_ministeriale": 32.50, "classe": "1"},
        {"titolo": "Matematica Blu 2.0 Vol. 2", "autore": "Bergamini, Barozzi", "isbn": "9788808537904", "materia": "Matematica", "prezzo_ministeriale": 34.00, "classe": "2"},
        {"titolo": "Matematica Blu 2.0 Vol. 3", "autore": "Bergamini, Barozzi", "isbn": "9788808537911", "materia": "Matematica", "prezzo_ministeriale": 35.50, "classe": "3"},
        {"titolo": "Fisica! Le regole del gioco Vol. 1", "autore": "Romeni", "isbn": "9788808920812", "materia": "Fisica", "prezzo_ministeriale": 28.90, "classe": "1"},
        {"titolo": "Fisica! Le regole del gioco Vol. 2", "autore": "Romeni", "isbn": "9788808920829", "materia": "Fisica", "prezzo_ministeriale": 30.50, "classe": "2"},
        {"titolo": "Chimica: Concetti e modelli", "autore": "Valitutti", "isbn": "9788808820716", "materia": "Chimica", "prezzo_ministeriale": 31.20, "classe": "1"},
        {"titolo": "Biologia: La scienza della vita", "autore": "Sadava", "isbn": "9788808720634", "materia": "Biologia", "prezzo_ministeriale": 33.80, "classe": "2"},
        {"titolo": "Letteratura Italiana Vol. 1", "autore": "Baldi, Giusso", "isbn": "9788839536211", "materia": "Italiano", "prezzo_ministeriale": 29.50, "classe": "3"},
        {"titolo": "Letteratura Italiana Vol. 2", "autore": "Baldi, Giusso", "isbn": "9788839536228", "materia": "Italiano", "prezzo_ministeriale": 31.00, "classe": "4"},
        {"titolo": "Promessi Sposi", "autore": "Manzoni", "isbn": "9788808620521", "materia": "Italiano", "prezzo_ministeriale": 18.50, "classe": "2"},
        {"titolo": "Storia: Dalle origini al Medioevo", "autore": "Gentile, Ronga", "isbn": "9788835047582", "materia": "Storia", "prezzo_ministeriale": 27.90, "classe": "1"},
        {"titolo": "Storia: Età moderna", "autore": "Gentile, Ronga", "isbn": "9788835047599", "materia": "Storia", "prezzo_ministeriale": 28.50, "classe": "2"},
        {"titolo": "Storia: Novecento", "autore": "Gentile, Ronga", "isbn": "9788835047605", "materia": "Storia", "prezzo_ministeriale": 29.80, "classe": "3"},
        {"titolo": "Filosofia: Dalle origini ad Aristotele", "autore": "Abbagnano", "isbn": "9788839521613", "materia": "Filosofia", "prezzo_ministeriale": 26.90, "classe": "3"},
        {"titolo": "English File Intermediate", "autore": "Latham-Koenig", "isbn": "9780194519847", "materia": "Inglese", "prezzo_ministeriale": 32.00, "classe": "2"},
        {"titolo": "English File Upper-Intermediate", "autore": "Latham-Koenig", "isbn": "9780194519854", "materia": "Inglese", "prezzo_ministeriale": 33.50, "classe": "3"},
        {"titolo": "Latino: Grammatica essenziale", "autore": "Flocchini", "isbn": "9788845152412", "materia": "Latino", "prezzo_ministeriale": 24.50, "classe": "1"},
        {"titolo": "Divina Commedia: Inferno", "autore": "Dante Alighieri", "isbn": "9788808420152", "materia": "Italiano", "prezzo_ministeriale": 15.90, "classe": "3"},
        {"titolo": "Divina Commedia: Purgatorio", "autore": "Dante Alighieri", "isbn": "9788808420169", "materia": "Italiano", "prezzo_ministeriale": 15.90, "classe": "4"},
        {"titolo": "Divina Commedia: Paradiso", "autore": "Dante Alighieri", "isbn": "9788808420176", "materia": "Italiano", "prezzo_ministeriale": 15.90, "classe": "5"}
    ]
    
    # Clear existing books
    await db.books.delete_many({})
    
    # Insert new books
    for book_data in sample_books:
        book = Book(**book_data)
        await db.books.insert_one(book.dict())
    
    return {"message": f"Inseriti {len(sample_books)} libri di esempio"}

@api_router.post("/seed/books-miur")
async def seed_books_miur(books: List[BookCreate]):
    """Import official MIUR textbook data"""
    # Clear existing books
    await db.books.delete_many({})
    
    inserted = 0
    for book_data in books:
        try:
            book = Book(**book_data.dict())
            await db.books.insert_one(book.dict())
            inserted += 1
        except Exception as e:
            logger.error(f"Error inserting book: {e}")
            continue
    
    return {"message": f"Inseriti {inserted} libri dal database MIUR"}

@api_router.get("/books/stats")
async def get_books_stats():
    """Get statistics about books in database"""
    total = await db.books.count_documents({})
    
    # Count by tipo_scuola
    primo_grado = await db.books.count_documents({"tipo_scuola": "primo_grado"})
    secondo_grado = await db.books.count_documents({"tipo_scuola": "secondo_grado"})
    
    # Count by materia (top 10)
    pipeline = [
        {"$group": {"_id": "$materia", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    materie = await db.books.aggregate(pipeline).to_list(10)
    
    return {
        "totale": total,
        "primo_grado": primo_grado,
        "secondo_grado": secondo_grado,
        "top_materie": materie
    }

@api_router.post("/seed/bookstores")
async def seed_bookstores():
    """Seed database with sample bookstores for testing"""
    sample_bookstores = [
        {"nome": "Cartolibreria Centrale", "indirizzo": "Via Roma 45", "citta": "Milano", "telefono": "02-1234567", "email": "centrale@test.it", "password": "test123"},
        {"nome": "Libreria dello Studente", "indirizzo": "Corso Italia 12", "citta": "Milano", "telefono": "02-7654321", "email": "studente@test.it", "password": "test123"},
        {"nome": "Cartoleria Bianchi", "indirizzo": "Via Garibaldi 78", "citta": "Roma", "telefono": "06-9876543", "email": "bianchi@test.it", "password": "test123"}
    ]
    
    await db.bookstores.delete_many({})
    
    for store_data in sample_bookstores:
        await register_bookstore(BookstoreCreate(**store_data))
    
    return {"message": f"Inserite {len(sample_bookstores)} cartolibrerie di esempio"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
