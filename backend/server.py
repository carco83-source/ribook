from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
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
import io

# PDF generation
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

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

def generate_order_code():
    """Genera codice ordine alfanumerico di 6 caratteri (es. A1B2C3)"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=6))

def generate_bookstore_password():
    """Genera password casuale per cartolibreria (8 caratteri)"""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choices(chars, k=8))

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
    telefono: Optional[str] = None
    password: str
    scuola: Optional[str] = None
    classe: Optional[str] = None
    sezione: Optional[str] = None
    tipo_scuola: Optional[str] = None  # primo_grado or secondo_grado

class UserLogin(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome: str
    cognome: str
    email: str
    telefono: Optional[str] = None
    password_hash: str
    scuola: Optional[str] = None
    classe: Optional[str] = None
    sezione: Optional[str] = None
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
    bookstore_names: List[str] = []  # List of bookstore names
    bookstore_addresses: List[str] = []  # List of bookstore addresses
    # Additional fields from frontend
    book_isbn: Optional[str] = None
    book_titolo: Optional[str] = None
    book_autori: Optional[str] = None
    book_disciplina: Optional[str] = None
    prezzo_copertina: Optional[float] = None
    prezzo_vendita: Optional[float] = None
    foto_aggiuntive: Optional[List[str]] = None
    has_writings: bool = False
    has_highlights: bool = False
    has_folds: bool = False
    cover_condition: Optional[str] = None
    pages_condition: Optional[str] = None
    child_profile_id: Optional[str] = None
    child_name: Optional[str] = None
    condition_percentage: Optional[float] = None

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
    bookstore_addresses: List[str] = []  # List of bookstore addresses for display
    note: Optional[str] = None
    foto_base64: Optional[str] = None
    # Stati: disponibile -> venduto -> in_consegna -> consegnato -> ritirato
    stato: str = "disponibile"
    status: str = "available"  # Per compatibilità con le query del Radar
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

# ============== PAYMENT/ORDER SYSTEM ==============

# Stati dell'ordine
ORDER_STATES = {
    "pending_payment": "In attesa di pagamento",
    "paid_escrow": "Pagato (in escrow)",
    "delivering_to_bookstore": "In consegna alla cartolibreria",
    "ready_for_pickup": "Pronto per il ritiro",
    "picked_up": "Ritirato (confermato)",
    "completed": "Completato (pagamento trasferito)",
    "cancelled": "Annullato",
    "refunded": "Rimborsato"
}

class PaymentIntent(BaseModel):
    """Simula Stripe PaymentIntent"""
    id: str = Field(default_factory=lambda: f"pi_{uuid.uuid4().hex[:24]}")
    amount: int  # in centesimi
    currency: str = "eur"
    status: str = "requires_payment_method"  # requires_payment_method, succeeded, canceled
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Order(BaseModel):
    """Ordine con sistema escrow"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_code: str = Field(default_factory=generate_order_code)  # Codice 6 caratteri per QR
    
    # Riferimenti
    buyer_id: str
    buyer_name: str
    seller_id: str
    seller_name: str
    listing_id: str
    bookstore_id: str
    bookstore_name: str
    
    # Dettagli libro
    book_isbn: str
    book_titolo: str
    book_autore: str = ""
    
    # Prezzi (in euro)
    prezzo_libro: float  # Prezzo del libro (va al venditore)
    commissione_app: float  # 17% commissione app
    commissione_cartolibreria: float  # 5% per la cartolibreria
    totale_acquirente: float  # Quello che paga l'acquirente
    netto_venditore: float  # Quello che riceve il venditore
    
    # Pagamento (simulato)
    payment_intent_id: Optional[str] = None
    payment_status: str = "pending"  # pending, paid, released, refunded
    
    # Stato ordine
    status: str = "pending_payment"
    status_history: List[dict] = Field(default_factory=list)
    
    # Date
    created_at: datetime = Field(default_factory=datetime.utcnow)
    paid_at: Optional[datetime] = None
    delivered_to_bookstore_at: Optional[datetime] = None
    ready_for_pickup_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    escrow_release_deadline: Optional[datetime] = None  # 2 giorni dopo ready_for_pickup
    
    # Stripe Connect (per futuro)
    seller_stripe_account_id: Optional[str] = None

class CreateOrderRequest(BaseModel):
    listing_id: str
    bookstore_id: str

class ConfirmPaymentRequest(BaseModel):
    order_id: str
    # In produzione qui ci sarebbe il payment_method_id di Stripe
    payment_method: str = "mock_card"

class SellerBankAccount(BaseModel):
    """Account bancario del venditore (simulato)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    account_holder_name: str
    iban: str
    is_verified: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    # In produzione: stripe_account_id per Stripe Connect

# ============== BOOKSTORE REGISTRATION SYSTEM ==============

class BookstoreRegistrationRequest(BaseModel):
    """Richiesta di registrazione cartolibreria"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    nome_attivita: str
    email: str
    partita_iva: str
    indirizzo: Optional[str] = ""
    citta: Optional[str] = ""
    telefono: Optional[str] = ""
    status: str = "pending"  # pending, approved, rejected
    generated_password: Optional[str] = None  # Password generata dall'admin
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approved_at: Optional[datetime] = None
    approved_by: Optional[str] = None  # admin user_id

class BookstoreRegistrationRequestCreate(BaseModel):
    nome_attivita: str
    email: str
    partita_iva: str
    indirizzo: Optional[str] = ""
    citta: Optional[str] = ""
    telefono: Optional[str] = ""

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
        "nome": user.get("nome", ""),
        "is_premium": user.get("is_premium", False),
        "scuola": user.get("scuola"),
        "classe": user.get("classe"),
        "sezione": user.get("sezione"),
        "profili_figli": user.get("profili_figli", [])
    }

# ============== PASSWORD RECOVERY ==============

class VerifyEmailRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    user_id: str
    new_password: str

@api_router.post("/auth/verify-email")
async def verify_email(data: VerifyEmailRequest):
    """Verifica se l'email esiste nel sistema"""
    user = await db.users.find_one({"email": data.email.lower()})
    if user:
        return {"exists": True, "user_id": user["id"]}
    return {"exists": False}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reimposta la password dell'utente"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="La password deve essere di almeno 6 caratteri")
    
    # Aggiorna la password
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {"password_hash": hash_password(data.new_password)}}
    )
    
    return {"message": "Password reimpostata con successo"}

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    # Return full user data including profili_figli
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


class UpdateUserRequest(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    scuola: Optional[str] = None
    classe: Optional[str] = None
    sezione: Optional[str] = None
    tipo_scuola: Optional[str] = None


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, update_data: UpdateUserRequest):
    """Update user profile data"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Build update dict with only non-None values
    update_fields = {}
    if update_data.nome is not None:
        update_fields["nome"] = update_data.nome
    if update_data.cognome is not None:
        update_fields["cognome"] = update_data.cognome
    if update_data.email is not None:
        update_fields["email"] = update_data.email
    if update_data.telefono is not None:
        update_fields["telefono"] = update_data.telefono
    if update_data.scuola is not None:
        update_fields["scuola"] = update_data.scuola
    if update_data.classe is not None:
        update_fields["classe"] = update_data.classe
    if update_data.sezione is not None:
        update_fields["sezione"] = update_data.sezione
    if update_data.tipo_scuola is not None:
        update_fields["tipo_scuola"] = update_data.tipo_scuola
    
    if update_fields:
        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
    
    # Return updated user
    updated_user = await db.users.find_one({"id": user_id})
    return UserPublic(**updated_user)


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
    codice_scuola: Optional[str] = None
    classe: str
    sezione: str
    tipo_scuola: str

@api_router.post("/users/{user_id}/profiles")
async def add_child_profile(user_id: str, profile_data: AddChildProfileRequest):
    """Add a new child profile to user account"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # IMPORTANTE: Salva la classe come intero per compatibilità con la collezione adozioni
    try:
        classe_int = int(profile_data.classe)
    except (ValueError, TypeError):
        classe_int = 1
    
    # Normalizza sezione in maiuscolo
    sezione_upper = profile_data.sezione.upper() if profile_data.sezione else ""
    
    # Valida che la sezione esista per questa scuola/classe
    if profile_data.codice_scuola and sezione_upper:
        adozione = await db.adozioni.find_one({
            "codice_scuola": profile_data.codice_scuola,
            "classe": classe_int,
            "sezione": sezione_upper
        })
        
        if not adozione:
            # Cerca la prima sezione disponibile come fallback
            sezioni_disp = await db.adozioni.find({
                "codice_scuola": profile_data.codice_scuola,
                "classe": classe_int
            }).to_list(100)
            
            if sezioni_disp:
                sezione_upper = sorted([s.get("sezione") for s in sezioni_disp])[0]
                print(f"Sezione {profile_data.sezione} non trovata, uso fallback: {sezione_upper}")
    
    new_profile = {
        "id": str(uuid.uuid4()),
        "nome_figlio": profile_data.nome_figlio,
        "scuola": profile_data.scuola,
        "codice_scuola": profile_data.codice_scuola or "",
        "classe": classe_int,  # Salvato come intero
        "sezione": sezione_upper,  # Sezione validata e maiuscola
        "tipo_scuola": profile_data.tipo_scuola
    }
    
    profili = user.get("profili_figli", [])
    profili.append(new_profile)
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profili_figli": profili}}
    )
    
    return {"message": "Profilo figlio aggiunto", "profile": new_profile}


# ============== SCHOOLS ENDPOINTS ==============

@api_router.get("/schools")
async def get_schools(tipo: Optional[str] = None):
    """Get all schools, optionally filtered by type (Media/Superiore)"""
    query = {}
    if tipo:
        query["tipo"] = tipo
    
    schools = await db.schools.find(query).to_list(None)
    
    # Format response
    result = []
    for school in schools:
        result.append({
            "codice": school.get("codice"),
            "nome": school.get("nome"),
            "tipo": school.get("tipo"),
            "comune": school.get("comune", "Catanzaro")
        })
    
    return result

@api_router.get("/schools/{codice}/sections")
async def get_school_sections_by_code(codice: str, classe: Optional[int] = None):
    """
    Restituisce le sezioni disponibili per una scuola specifica.
    Se viene specificata una classe, restituisce solo le sezioni per quella classe.
    """
    match_stage = {"codice_scuola": codice}
    if classe:
        match_stage["classe"] = classe
    
    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$classe",
            "sezioni": {"$addToSet": "$sezione"}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.adozioni.aggregate(pipeline).to_list(None)
    
    # Raccogli tutte le sezioni uniche ordinate
    all_sections = set()
    sections_by_class = {}
    
    for r in results:
        sections_by_class[str(r["_id"])] = sorted(r["sezioni"])
        all_sections.update(r["sezioni"])
    
    return {
        "codice_scuola": codice,
        "sezioni": sorted(list(all_sections)),
        "sezioni_per_classe": sections_by_class
    }



@api_router.get("/users/{user_id}/profiles")
async def get_child_profiles(user_id: str):
    """Get all child profiles for a user"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Include the main profile as the first one (with fallbacks for missing fields)
    main_profile = {
        "id": "main",
        "nome_figlio": "Profilo principale",
        "scuola": user.get("scuola", ""),
        "classe": user.get("classe", ""),
        "sezione": user.get("sezione", ""),
        "tipo_scuola": user.get("tipo_scuola", ""),
        "codice_scuola": user.get("codice_scuola", "")
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


@api_router.put("/users/{user_id}/profiles/{profile_id}")
async def update_child_profile(user_id: str, profile_id: str, profile_data: AddChildProfileRequest):
    """Update a child profile"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    if profile_id == "main":
        # Update main profile
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "scuola": profile_data.scuola,
                "codice_scuola": profile_data.codice_scuola or "",
                "classe": profile_data.classe,
                "sezione": profile_data.sezione,
                "tipo_scuola": profile_data.tipo_scuola
            }}
        )
        return {"message": "Profilo principale aggiornato"}
    
    # Update child profile
    profili = user.get("profili_figli", [])
    updated = False
    
    # Converti classe in intero per compatibilità con collezione adozioni
    try:
        classe_int = int(profile_data.classe)
    except (ValueError, TypeError):
        classe_int = 1
    
    # Normalizza sezione in maiuscolo
    sezione_upper = profile_data.sezione.upper() if profile_data.sezione else ""
    
    # Valida che la sezione esista per questa scuola/classe
    if profile_data.codice_scuola and sezione_upper:
        adozione = await db.adozioni.find_one({
            "codice_scuola": profile_data.codice_scuola,
            "classe": classe_int,
            "sezione": sezione_upper
        })
        
        if not adozione:
            # Cerca la prima sezione disponibile come fallback
            sezioni_disp = await db.adozioni.find({
                "codice_scuola": profile_data.codice_scuola,
                "classe": classe_int
            }).to_list(100)
            
            if sezioni_disp:
                sezione_upper = sorted([s.get("sezione") for s in sezioni_disp])[0]
                print(f"Update profilo: Sezione {profile_data.sezione} non trovata, uso fallback: {sezione_upper}")
    
    for i, p in enumerate(profili):
        if p["id"] == profile_id:
            profili[i] = {
                "id": profile_id,
                "nome_figlio": profile_data.nome_figlio,
                "scuola": profile_data.scuola,
                "codice_scuola": profile_data.codice_scuola or "",
                "classe": classe_int,  # Salvato come intero
                "sezione": sezione_upper,  # Sezione validata e maiuscola
                "tipo_scuola": profile_data.tipo_scuola
            }
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Profilo non trovato")
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"profili_figli": profili}}
    )
    
    return {"message": "Profilo aggiornato", "profile": profili[i]}


# ============== LISTING REPORTS ==============

class ReportListingRequest(BaseModel):
    motivo: str  # "foto_errata", "contenuto_inappropriato", "prezzo_errato", "altro"
    descrizione: Optional[str] = None


@api_router.post("/listings/{listing_id}/report")
async def report_listing(listing_id: str, report: ReportListingRequest, reporter_id: str):
    """Report a listing for incorrect photo or content"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    report_doc = {
        "id": str(uuid.uuid4()),
        "listing_id": listing_id,
        "reporter_id": reporter_id,
        "seller_id": listing.get("seller_id"),
        "motivo": report.motivo,
        "descrizione": report.descrizione,
        "stato": "aperta",  # aperta, in_revisione, risolta, respinta
        "created_at": datetime.utcnow()
    }
    
    await db.reports.insert_one(report_doc)
    
    # Create notification for admin
    # (In a real app, this would send an email or push notification)
    
    return {"message": "Segnalazione inviata", "report_id": report_doc["id"]}


@api_router.get("/admin/reports")
async def get_reports(status: Optional[str] = None, limit: int = 50):
    """Get all reports (admin only)"""
    query = {}
    if status:
        query["stato"] = status
    
    reports = await db.reports.find(query).sort("created_at", -1).to_list(limit)
    for r in reports:
        r.pop("_id", None)
    return reports


@api_router.put("/admin/reports/{report_id}")
async def update_report_status(report_id: str, new_status: str):
    """Update report status (admin only)"""
    result = await db.reports.update_one(
        {"id": report_id},
        {"$set": {"stato": new_status, "updated_at": datetime.utcnow()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Segnalazione non trovata")
    return {"message": "Stato aggiornato"}


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
async def get_books(
    classe: Optional[str] = None, 
    materia: Optional[str] = None, 
    tipo_scuola: Optional[str] = None, 
    codice_scuola: Optional[str] = None,
    limit: int = 100, 
    skip: int = 0, 
    search: Optional[str] = None
):
    query = {}
    
    # Filter by codice_scuola (school code)
    if codice_scuola:
        query["scuole_adottanti"] = codice_scuola
    
    # Filter by classe/anno_corso
    if classe:
        try:
            anno = int(classe)
            query["anni_corso"] = anno
        except ValueError:
            query["classe"] = classe
    
    if materia:
        query["$or"] = [
            {"materia": {"$regex": materia, "$options": "i"}},
            {"disciplina": {"$regex": materia, "$options": "i"}}
        ]
    
    if tipo_scuola:
        if tipo_scuola == "primo_grado":
            query["tipi_scuola"] = "MM"
        elif tipo_scuola == "secondo_grado":
            query["tipi_scuola"] = {"$in": ["NO", "NT", "NB", "NA"]}
    
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
        if "$or" in query:
            existing_or = query["$or"]
            query["$and"] = [
                {"$or": existing_or},
                {"$or": [
                    {"titolo": {"$regex": search, "$options": "i"}},
                    {"autori": {"$regex": search, "$options": "i"}},
                    {"isbn": {"$regex": search, "$options": "i"}}
                ]}
            ]
            del query["$or"]
        else:
            query["$or"] = [
                {"titolo": {"$regex": search, "$options": "i"}},
                {"autori": {"$regex": search, "$options": "i"}},
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


@api_router.get("/books/search")
async def search_books_generic(q: str = Query(..., min_length=3), limit: int = Query(20)):
    """
    Ricerca generica libri per titolo o ISBN nei libri delle scuole di Catanzaro.
    """
    # Cerca per ISBN esatto
    if q.isdigit() and len(q) >= 10:
        books = await db.adozioni.aggregate([
            {"$unwind": "$libri"},
            {"$match": {"libri.isbn": {"$regex": q, "$options": "i"}}},
            {"$limit": limit},
            {"$project": {
                "_id": 0,
                "id": "$libri.isbn",
                "isbn": "$libri.isbn",
                "titolo": "$libri.titolo",
                "autori": "$libri.autori",
                "disciplina": "$libri.disciplina",
                "editore": "$libri.editore",
                "prezzo_copertina": "$libri.prezzo_copertina",
                "classe": "$classe",
                "scuola": "$nome_scuola"
            }}
        ]).to_list(limit)
    else:
        # Cerca per titolo
        books = await db.adozioni.aggregate([
            {"$unwind": "$libri"},
            {"$match": {"libri.titolo": {"$regex": q, "$options": "i"}}},
            {"$limit": limit},
            {"$project": {
                "_id": 0,
                "id": "$libri.isbn",
                "isbn": "$libri.isbn",
                "titolo": "$libri.titolo",
                "autori": "$libri.autori",
                "disciplina": "$libri.disciplina",
                "editore": "$libri.editore",
                "prezzo_copertina": "$libri.prezzo_copertina",
                "classe": "$classe",
                "scuola": "$nome_scuola"
            }}
        ]).to_list(limit)
    
    # Rimuovi duplicati per ISBN
    seen = set()
    unique_books = []
    for book in books:
        isbn = book.get("isbn", "")
        if isbn and isbn not in seen:
            seen.add(isbn)
            unique_books.append(book)
    
    return {"books": unique_books, "total": len(unique_books)}


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
async def create_listing(listing_data: BookListingCreate, user_id: str = Query(...)):
    # Get user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get book - search by id or isbn
    book = await db.books.find_one({
        "$or": [
            {"id": listing_data.book_id},
            {"isbn": listing_data.book_id},
            {"isbn": listing_data.book_isbn} if listing_data.book_isbn else {"isbn": ""}
        ]
    })
    
    # If book not found, create a minimal book record from the listing data
    if not book:
        book = {
            "id": listing_data.book_isbn or listing_data.book_id,
            "isbn": listing_data.book_isbn or listing_data.book_id,
            "titolo": listing_data.book_titolo or "Libro",
            "autore": listing_data.book_autori or "",
            "materia": listing_data.book_disciplina or "",
            "disciplina": listing_data.book_disciplina or "",
            "classe": "",
            "prezzo_ministeriale": listing_data.prezzo_copertina or 0,
            "prezzo_copertina": listing_data.prezzo_copertina or 0
        }
    
    # Get child profile info if provided
    # NOTA: La verifica Premium per vendere libri di altre classi è stata rimossa
    # perché l'app ora mostra solo i libri vendibili (classe precedente o libri con stesso ISBN)
    # tramite l'endpoint books-to-sell. Se l'utente usa "Vendi altro libro" può vendere qualsiasi libro.
    
    child_profile = None
    child_profile_id = listing_data.child_profile_id
    if child_profile_id:
        for profile in user.get("profili_figli", []):
            if profile["id"] == child_profile_id:
                child_profile = profile
                break
    
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
    
    # CONVERT OLD FORMAT TO condition_details
    # Frontend sends: has_writings, has_highlights, has_folds, cover_condition, pages_condition
    elif listing_data.cover_condition or listing_data.has_writings or listing_data.has_highlights or listing_data.has_folds:
        # Map old format to new condition_details structure
        sottolineature = 0  # 0=Nessuna, 1=Poche, 2=Molte
        if listing_data.has_writings:
            sottolineature = 2 if listing_data.has_highlights else 1
        elif listing_data.has_highlights:
            sottolineature = 1
        
        copertina = 0  # 0=Integra, 1=Un po' rovinata, 2=Molto rovinata
        if listing_data.cover_condition == 'usurata':
            copertina = 2
        elif listing_data.cover_condition == 'buona':
            copertina = 1
        
        pagine = 0  # 0=Perfette, 1=Qualche piega, 2=Molte pieghe
        if listing_data.pages_condition == 'ingiallite':
            pagine = 2
        elif listing_data.pages_condition == 'buone':
            pagine = 1
        
        # Has folds affects pages condition
        if listing_data.has_folds and pagine < 1:
            pagine = 1
        
        esercizi = 0  # 0=Nessuno, 1=Alcuni, 2=Molti
        # Assume no exercises unless specified otherwise
        
        condition_details = {
            "sottolineature": sottolineature,
            "copertina": copertina,
            "pagine": pagine,
            "esercizi": esercizi
        }
    
    # Validate condition
    if condizione not in BOOK_CONDITIONS:
        condizione = "buono"  # Default to buono if invalid
    
    # Calculate base price based on condition
    base_price = book.get("prezzo_ministeriale") or book.get("prezzo_copertina") or listing_data.prezzo_copertina or 0
    prezzo_vendita = base_price * BOOK_CONDITIONS.get(condizione, 0.5)
    
    # Calculate supplement price (10% of book price for all supplements)
    prezzo_fascicoli = 0.0
    if listing_data.fascicoli_totali > 0:
        prezzo_totale_fascicoli = base_price * 0.10
        if listing_data.fascicoli_presenti > 0:
            prezzo_fascicoli = round((prezzo_totale_fascicoli / listing_data.fascicoli_totali) * listing_data.fascicoli_presenti, 2)
    
    # Get bookstore names and addresses
    bookstore_names = listing_data.bookstore_names if listing_data.bookstore_names else []
    bookstore_addresses = listing_data.bookstore_addresses if listing_data.bookstore_addresses else []
    
    # If names/addresses not provided from frontend, try to get from DB
    if listing_data.bookstore_ids and not bookstore_names:
        for bs_id in listing_data.bookstore_ids:
            bookstore = await db.bookstores.find_one({"id": bs_id})
            if bookstore:
                bookstore_names.append(bookstore.get("nome", ""))
                bookstore_addresses.append(bookstore.get("indirizzo", ""))
    
    # Use frontend-provided price if available, otherwise calculate
    final_price = listing_data.prezzo_vendita if listing_data.prezzo_vendita else round(prezzo_vendita, 2)
    
    # Build full title with volume if available
    titolo_completo = listing_data.book_titolo or book.get("titolo", "")
    volume = book.get("volume", "")
    if volume and volume not in titolo_completo:
        titolo_completo = f"{titolo_completo} - Vol. {volume}"
    
    listing = BookListing(
        seller_id=user_id,
        seller_username=user.get("username", "Utente"),
        book_id=book.get("id") or book.get("isbn") or listing_data.book_id,
        book_titolo=titolo_completo,
        book_autore=listing_data.book_autori or book.get("autore", ""),
        book_isbn=listing_data.book_isbn or book.get("isbn", ""),
        book_materia=listing_data.book_disciplina or book.get("materia", book.get("disciplina", "")),
        book_classe=book.get("classe", ""),
        prezzo_ministeriale=listing_data.prezzo_copertina or book.get("prezzo_ministeriale", 0),
        condizione=condizione,
        condition_details=condition_details,
        prezzo_vendita=final_price,
        ha_fascicoli=listing_data.ha_fascicoli,
        fascicoli_totali=listing_data.fascicoli_totali,
        fascicoli_presenti=listing_data.fascicoli_presenti,
        prezzo_fascicoli=prezzo_fascicoli,
        bookstore_ids=listing_data.bookstore_ids,
        bookstore_names=bookstore_names,
        bookstore_addresses=bookstore_addresses,
        note=listing_data.note,
        foto_base64=listing_data.foto_base64
    )
    
    await db.listings.insert_one(listing.dict())
    
    # NOTIFICA: Cerca utenti che hanno richieste attive per questo libro
    book_isbn = listing.book_isbn
    if book_isbn:
        # Trova tutte le richieste attive per questo ISBN (escludi il venditore)
        active_requests = await db.requests.find({
            "book_isbn": book_isbn,
            "stato": "cercando",
            "buyer_id": {"$ne": user_id}  # Non notificare il venditore stesso
        }).to_list(100)
        
        # Crea notifiche per ogni utente che stava cercando questo libro
        for request in active_requests:
            notification = {
                "id": str(uuid.uuid4()),
                "user_id": request.get("buyer_id"),
                "type": "book_available",
                "title": "Libro Disponibile!",
                "message": f"Il libro '{listing.book_titolo[:50]}' che stavi cercando è ora disponibile!",
                "book_isbn": book_isbn,
                "book_titolo": listing.book_titolo,
                "listing_id": listing.id,
                "prezzo": listing.prezzo_vendita,
                "read": False,
                "created_at": datetime.utcnow().isoformat()
            }
            await db.notifications.insert_one(notification)
    
    return listing

# Endpoint per le notifiche
@api_router.get("/notifications/{user_id}")
async def get_notifications(user_id: str, limit: int = 50):
    """Recupera le notifiche per un utente"""
    notifications = await db.notifications.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    for n in notifications:
        n.pop('_id', None)
    
    return {"notifications": notifications, "unread_count": sum(1 for n in notifications if not n.get("read", True))}

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    """Segna una notifica come letta"""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"read": True}}
    )
    return {"success": result.modified_count > 0}

@api_router.get("/listings")
async def get_listings(classe: Optional[str] = None, materia: Optional[str] = None, stato: str = "disponibile", limit: int = 50, skip: int = 0):
    # Support both 'stato' (old) and 'status' (new) fields
    query = {"$or": [{"stato": stato}, {"status": "available" if stato == "disponibile" else stato}]}
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

@api_router.get("/listings/{listing_id}")
async def get_listing_by_id(listing_id: str):
    """Get a single listing by its ID"""
    listing = await db.listings.find_one({"id": listing_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    listing.pop('_id', None)
    
    # Carica i dati completi delle cartolibrerie
    bookstore_ids = listing.get("bookstore_ids", [])
    if bookstore_ids:
        bookstores = []
        for bs_id in bookstore_ids:
            # Cerca per id o per nome parziale (rimuovi apostrofi per match migliore)
            clean_id = bs_id.replace("'", "").replace("l", "").replace("L", "")
            store = await db.bookstores.find_one({"$or": [
                {"id": bs_id},
                {"nome": {"$regex": bs_id, "$options": "i"}},
                {"nome": {"$regex": clean_id, "$options": "i"}}
            ]})
            if store:
                store.pop('_id', None)
                bookstores.append(store)
        listing["bookstores"] = bookstores
    
    return listing


@api_router.get("/listings/isbn/{isbn}")
async def get_listings_by_isbn(isbn: str):
    """Get all available listings for a specific ISBN"""
    # Find listings for this ISBN
    query = {
        "book_isbn": isbn,
        "status": "available"
    }
    
    projection = {"foto_base64": 0}
    listings = await db.listings.find(query, projection).sort("prezzo_vendita", 1).to_list(50)
    
    # Enrich with seller info
    for listing in listings:
        listing.pop('_id', None)
        seller = await db.users.find_one({"id": listing.get("seller_id")})
        if seller:
            listing["seller_name"] = seller.get("nome", seller.get("username", "Utente"))
            listing["seller_username"] = seller.get("username", "Utente")
    
    # Get book info from adozioni or books collection
    book_info = None
    adozione = await db.adozioni.find_one({"libri.isbn": isbn})
    if adozione:
        for libro in adozione.get("libri", []):
            if libro.get("isbn") == isbn:
                book_info = {
                    "isbn": isbn,
                    "titolo": libro.get("titolo", ""),
                    "disciplina": libro.get("disciplina", ""),
                    "editore": libro.get("editore", ""),
                    "autori": libro.get("autori", ""),
                    "prezzo_copertina": libro.get("prezzo_copertina", 0)
                }
                break
    
    return {
        "isbn": isbn,
        "book": book_info,
        "listings": listings,
        "total": len(listings)
    }


@api_router.get("/listings/book/{book_id}")
async def get_listings_for_book(book_id: str, stato: str = "disponibile"):
    """Get all available listings for a specific book"""
    # Find book by ID or ISBN
    book = await db.books.find_one({"$or": [{"id": book_id}, {"isbn": book_id}]})
    if not book:
        return {"listings": [], "book": None, "message": "Libro non trovato"}
    
    # Find listings for this book
    query = {
        "$or": [
            {"book_id": book.get("id")},
            {"book_isbn": book.get("isbn")}
        ],
        "stato": stato
    }
    
    projection = {"foto_base64": 0}
    listings = await db.listings.find(query, projection).sort("created_at", -1).to_list(50)
    
    # Enrich with seller info
    for listing in listings:
        listing.pop('_id', None)
        # Get seller info
        seller = await db.users.find_one({"id": listing.get("seller_id")})
        if seller:
            listing["seller_name"] = seller.get("nome", seller.get("username", "Utente"))
            listing["seller_rating"] = seller.get("rating", 5.0)
    
    return {
        "listings": listings,
        "book": {
            "id": book.get("id"),
            "titolo": book.get("titolo"),
            "disciplina": book.get("disciplina"),
            "prezzo_copertina": book.get("prezzo_copertina") or book.get("prezzo_ministeriale"),
            "isbn": book.get("isbn")
        },
        "total": len(listings)
    }

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
    
    # Cerca prima nella collezione books, poi in adozioni
    book = await db.books.find_one({"$or": [
        {"id": request_data.book_id},
        {"isbn": request_data.book_id}
    ]})
    
    if not book:
        # Prova a cercare nella collezione adozioni
        book = await db.adozioni.find_one({"isbn": request_data.book_id})
    
    if not book:
        # Se non trovato, crea una richiesta minima con i dati disponibili
        book_request = BookRequest(
            buyer_id=user_id,
            buyer_username=user["username"],
            book_id=request_data.book_id,
            book_titolo="Libro richiesto",
            book_autore="",
            book_isbn=request_data.book_id,
            book_materia="",
            book_classe=""
        )
    else:
        # Gestisci anni_corso/classe che può essere lista o stringa
        book_classe = book.get("classe", book.get("anni_corso", ""))
        if isinstance(book_classe, list):
            book_classe = str(book_classe[0]) if book_classe else ""
        else:
            book_classe = str(book_classe) if book_classe else ""
            
        book_request = BookRequest(
            buyer_id=user_id,
            buyer_username=user["username"],
            book_id=book.get("id", book.get("isbn", request_data.book_id)),
            book_titolo=book.get("titolo", ""),
            book_autore=book.get("autore", book.get("autori", "")),
            book_isbn=book.get("isbn", request_data.book_id),
            book_materia=book.get("materia", book.get("disciplina", "")),
            book_classe=book_classe
        )
    
    # Verifica se esiste già una richiesta per questo libro
    existing = await db.requests.find_one({
        "buyer_id": user_id,
        "book_isbn": book_request.book_isbn,
        "stato": "cercando"
    })
    if existing:
        existing.pop('_id', None)
        return existing
    
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
    
    # Get book ISBNs user is looking for (use book_isbn field)
    wanted_isbns = [req.get("book_isbn", req.get("book_id", "")) for req in user_requests]
    wanted_isbns = [isbn for isbn in wanted_isbns if isbn]  # Filter empty
    
    # Find listings by ISBN
    pipeline = [
        {
            "$match": {
                "book_isbn": {"$in": wanted_isbns},
                "seller_id": {"$ne": user_id},
                "status": "available"
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
        {"$unwind": {"path": "$seller_info", "preserveNullAndEmptyArrays": True}},
        {"$limit": limit}
    ]
    
    listings = await db.listings.aggregate(pipeline).to_list(limit)
    
    # Get user's school info from child profiles
    user_scuola = None
    user_classe = None
    user_sezione = None
    profili = user.get("profili_figli", [])
    if profili:
        first_child = profili[0]
        user_scuola = first_child.get("codice_scuola", "")
        user_classe = first_child.get("classe", "")
        user_sezione = first_child.get("sezione", "")
    
    matches = []
    for listing in listings:
        listing.pop('_id', None)
        seller = listing.pop('seller_info', {})
        
        # Compare by codice_scuola instead of scuola name
        seller_codice = listing.get("codice_scuola", "")
        seller_classe = str(listing.get("classe", ""))
        seller_sezione = listing.get("sezione", "")
        
        same_school = seller_codice == user_scuola
        same_class = seller_classe == str(user_classe) and same_school
        same_section = seller_sezione == user_sezione and same_class
        
        # Score: same section = 100, same class = 80, same school = 60, other = 40
        if same_section:
            score = 100
        elif same_class:
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
    wanted_isbns = [req.get("book_isbn", req.get("book_id", "")) for req in user_requests]
    wanted_isbns = [isbn for isbn in wanted_isbns if isbn]
    
    if not wanted_isbns:
        return {
            "total_matches": 0,
            "same_section": 0,
            "same_class": 0,
            "same_school": 0,
            "others": 0,
            "books_searching": 0
        }
    
    # Get user's school info from child profiles
    user_codice_scuola = None
    user_classe = None
    user_sezione = None
    profili = user.get("profili_figli", [])
    if profili:
        first_child = profili[0]
        user_codice_scuola = first_child.get("codice_scuola", "")
        user_classe = str(first_child.get("classe", ""))
        user_sezione = first_child.get("sezione", "")
    
    # Find listings by ISBN (exclude reserved and sold)
    pipeline = [
        {
            "$match": {
                "book_isbn": {"$in": wanted_isbns},
                "seller_id": {"$ne": user_id},
                "$or": [
                    {"status": "available"},
                    {"stato": "disponibile"}
                ],
                "stato": {"$nin": ["riservato", "venduto"]},
                "status": {"$nin": ["reserved", "sold"]}
            }
        },
        {
            "$project": {
                "codice_scuola": 1,
                "classe": 1,
                "sezione": 1,
                "seller_id": 1
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
        listing_codice = listing.get("codice_scuola", "")
        listing_classe = str(listing.get("classe", ""))
        listing_sezione = listing.get("sezione", "")
        
        is_same_school = listing_codice == user_codice_scuola
        is_same_class = listing_classe == user_classe and is_same_school
        is_same_section = listing_sezione == user_sezione and is_same_class
        
        if is_same_section:
            same_section += 1
        elif is_same_class:
            same_class += 1
        elif is_same_school:
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



@api_router.get("/libri-acquistabili/totale")
async def get_total_available_books():
    """Get total count of all available books on the platform"""
    total = await db.listings.count_documents({"status": "available"})
    return {"totale": total}

@api_router.get("/libri-acquistabili/{user_id}")
async def get_purchasable_books_for_user(user_id: str):
    """
    Get purchasable books for all children profiles of a user.
    
    LOGICA BASATA SU ISBN:
    1. Trovo gli ISBN dei libri adottati nella PROSSIMA CLASSE del profilo (dalla collezione adozioni)
    2. Cerco listings disponibili che hanno quegli ISBN
    3. Mostro quei libri
    
    Esempio: Cloe (1ª, scuola CZMM86001P) 
    → Cerco ISBN adottati in 2ª nella stessa scuola
    → Cerco listings con quegli ISBN
    """
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Total available on platform
    total_platform = await db.listings.count_documents({"status": "available"})
    
    # Get books per child profile
    profili = user.get("profili_figli", [])
    children_data = []
    
    for child in profili:
        codice_scuola = child.get("codice_scuola", "")
        classe = int(child.get("classe", 1))
        sezione = child.get("sezione", "A")
        tipo = child.get("tipo_scuola", "primo_grado")
        
        if not codice_scuola:
            children_data.append({
                "child_id": child.get("id"),
                "nome": child.get("nome_figlio", ""),
                "libri_disponibili": 0,
                "libri": [],
                "note": "Codice scuola mancante"
            })
            continue
        
        # Determine cycle limits
        if tipo == "primo_grado":
            cycle_max = 3  # Medie: 1-2-3
        else:
            # Superiori: biennio 1-2, triennio 3-4-5
            cycle_max = 2 if classe <= 2 else 5
        
        # La classe dei libri che mi servono (prossimo anno)
        classe_prossimo_anno = classe + 1 if classe < cycle_max else None
        
        if not classe_prossimo_anno:
            # Fine ciclo, non può comprare libri usati per l'anno prossimo
            children_data.append({
                "child_id": child.get("id"),
                "nome": child.get("nome_figlio", ""),
                "scuola": child.get("scuola", ""),
                "classe": classe,
                "sezione": sezione,
                "libri_disponibili": 0,
                "libri": [],
                "note": "Fine ciclo - nessun libro usato disponibile"
            })
            continue
        
        # STEP 1: Trova gli ISBN dei libri adottati nella PROSSIMA CLASSE della STESSA SCUOLA
        adozioni_prossimo_anno = await db.adozioni.find({
            "codice_scuola": codice_scuola,
            "classe": classe_prossimo_anno
        }).to_list(None)
        
        # Raccogli tutti gli ISBN dalla prossima classe
        isbn_necessari = set()
        libri_adottati_info = {}  # Per avere info sui libri adottati
        
        for adozione in adozioni_prossimo_anno:
            for libro in adozione.get("libri", []):
                isbn = libro.get("isbn", "")
                if isbn:
                    isbn_necessari.add(isbn)
                    libri_adottati_info[isbn] = {
                        "titolo": libro.get("titolo", ""),
                        "disciplina": libro.get("disciplina", ""),
                        "editore": libro.get("editore", ""),
                        "prezzo_copertina": libro.get("prezzo_copertina", 0),
                        "autori": libro.get("autori", ""),
                        "is_volume_unico": libro.get("is_volume_unico", False)
                    }
        
        if not isbn_necessari:
            children_data.append({
                "child_id": child.get("id"),
                "nome": child.get("nome_figlio", ""),
                "scuola": child.get("scuola", ""),
                "classe": classe,
                "classe_libri": classe_prossimo_anno,
                "sezione": sezione,
                "libri_disponibili": 0,
                "libri": [],
                "isbn_cercati": 0,
                "note": f"Nessun libro trovato per classe {classe_prossimo_anno}"
            })
            continue
        
        # STEP 2: Cerca listings disponibili con quegli ISBN
        query = {
            "status": "available",
            "seller_id": {"$ne": user_id},
            "book_isbn": {"$in": list(isbn_necessari)}
        }
        
        listings = await db.listings.find(query).to_list(100)
        
        # STEP 3: Costruisci la lista dei libri acquistabili
        libri = []
        for listing in listings:
            isbn = listing.get("book_isbn", "")
            adottato_info = libri_adottati_info.get(isbn, {})
            
            libri.append({
                "listing_id": listing.get("id"),
                "isbn": isbn,
                "titolo": listing.get("book_titolo") or adottato_info.get("titolo", ""),
                "autore": listing.get("book_autore") or adottato_info.get("autori", ""),
                "editore": listing.get("book_editore") or adottato_info.get("editore", ""),
                "disciplina": listing.get("book_disciplina") or adottato_info.get("disciplina", ""),
                "prezzo_copertina": listing.get("prezzo_copertina") or adottato_info.get("prezzo_copertina", 0),
                "prezzo_vendita": listing.get("prezzo_vendita", 0),
                "condizione": listing.get("condizione", ""),
                "condition_details": listing.get("condition_details", {}),
                "venditore": listing.get("seller_username", ""),
                "scuola_venditore": listing.get("scuola", ""),
                "codice_scuola_venditore": listing.get("codice_scuola", ""),
                "bookstores": listing.get("bookstores", []),
                "is_volume_unico": adottato_info.get("is_volume_unico", False)
            })
        
        children_data.append({
            "child_id": child.get("id"),
            "nome": child.get("nome_figlio", ""),
            "scuola": child.get("scuola", ""),
            "codice_scuola": codice_scuola,
            "classe": classe,
            "classe_libri": classe_prossimo_anno,
            "sezione": sezione,
            "libri_disponibili": len(libri),
            "isbn_cercati": len(isbn_necessari),
            "libri": libri
        })
    
    return {
        "totale_piattaforma": total_platform,
        "profili": children_data
    }



@api_router.get("/radar/{user_id}/class-compatibility")
async def get_class_compatibility(user_id: str):
    """
    Calcola il flusso TEORICO dei libri tra classi per una SPECIFICA scuola.
    Confronta EDITORE + TITOLO BASE per determinare se stessa serie/edizione.
    """
    import re
    
    def get_series_name(title: str) -> str:
        """
        Estrae il NOME DELLA SERIE dal titolo.
        Es: "ESATTO! ARITMETICA 2 + GEOMETRIA 2..." → "ESATTO!"
        Es: "OSSERVARE E CAPIRE LE SCIENZE 2ED. - VOLUME 1" → "OSSERVARE E CAPIRE LE SCIENZE"
        Es: "GEOAGENDA EDIZIONE ROSSA - VOLUME 1" → "GEOAGENDA EDIZIONE ROSSA"
        Es: "LIBRO APERTO V.2+BUSSOLA" → "LIBRO APERTO"
        """
        title = title.upper().strip()
        
        # Rimuovi "V.X" o "V X" (versione abbreviata di volume)
        title = re.sub(r'\s*V\.?\s*\d+', '', title, flags=re.IGNORECASE)
        
        # Prima rimuovi tutto dopo " + " (materiali aggiuntivi)
        if '+' in title:
            title = title.split('+')[0]
        
        # Rimuovi "(LDM)" e simili
        title = re.sub(r'\s*\(LDM.*?\)', '', title, flags=re.IGNORECASE)
        
        # Rimuovi "- VOLUME X" o "VOLUME X"
        title = re.sub(r'\s*-?\s*(VOLUME|VOL\.?)\s*\d+.*', '', title, flags=re.IGNORECASE)
        
        # Rimuovi " - " seguito da numeri
        title = re.sub(r'\s*-\s*\d+.*', '', title)
        
        # Rimuovi "LE SCIENZE X" -> "LE SCIENZE"
        title = re.sub(r'\s+(LE\s+SCIENZE)\s+\d+', r' \1', title)
        
        # Rimuovi numeri finali isolati (es. "STORIA 1" → "STORIA")
        title = re.sub(r'\s+\d+\s*$', '', title)
        
        # Rimuovi parole specifiche per anno: ARITMETICA, ALGEBRA, GEOMETRIA (cambiano ogni anno)
        # Ma SOLO se ci sono altre parole prima (per non cancellare tutto)
        words = title.split()
        if len(words) > 1:
            # Rimuovi parole che cambiano tra anni della stessa serie
            anno_specific = {'ARITMETICA', 'ALGEBRA', 'GEOMETRIA', 'ANTOLOGIA', 'LETTERATURA'}
            words = [w for w in words if w not in anno_specific]
        
        title = ' '.join(words).strip()
        
        # Rimuovi trattini e spazi finali
        title = re.sub(r'\s*-\s*$', '', title).strip()
        
        return title
    
    def has_edition_marker(title: str) -> str:
        """Estrae indicatore di edizione se presente"""
        title = title.upper()
        # Cerca pattern di edizione: "2ED.", "EDIZIONE VERDE", "ED. BLU", etc.
        match = re.search(r'(\d+ED\.?|EDIZIONE\s+\w+|ED\.\s*\w+)', title)
        return match.group(1) if match else ""
    
    def same_series(book1: dict, book2: dict) -> bool:
        """
        Verifica se due libri sono della stessa SERIE editoriale.
        Es: "ESATTO! ARITMETICA 2" e "ESATTO! ALGEBRA" sono la stessa serie.
        Ma "OSSERVARE E CAPIRE 2ED." e "OSSERVARE E CAPIRE" sono edizioni diverse.
        """
        # Deve avere stesso editore
        if book1.get("editore", "").upper() != book2.get("editore", "").upper():
            return False
        
        t1 = book1.get("titolo", "").upper()
        t2 = book2.get("titolo", "").upper()
        
        # Se uno ha indicatore di edizione e l'altro no, o sono diversi → NON stessa serie
        ed1 = has_edition_marker(t1)
        ed2 = has_edition_marker(t2)
        if ed1 != ed2:
            return False  # Edizioni diverse!
        
        # Estrai il nome della serie
        series1 = get_series_name(t1)
        series2 = get_series_name(t2)
        
        # Se i nomi serie sono uguali → stessa serie
        if series1 == series2:
            return True
        
        # Confronto con similarità per gestire piccole differenze
        words1 = set(series1.split())
        words2 = set(series2.split())
        words1.discard('-')
        words2.discard('-')
        
        if not words1 or not words2:
            return False
        
        common = words1.intersection(words2)
        # Almeno 70% di parole in comune E almeno 2 parole in comune
        min_words = min(len(words1), len(words2))
        similarity = len(common) / max(len(words1), len(words2))
        
        return similarity >= 0.7 and len(common) >= min(2, min_words)
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    user_classe = int(user.get("classe", 1))
    user_tipo = user.get("tipo_scuola", "primo_grado")
    codice_scuola = user.get("codice_scuola", "")
    
    # Se non ha codice scuola, prova a cercarlo
    if not codice_scuola:
        scuola_nome = user.get("scuola", "")
        school = await db.schools.find_one({"nome": {"$regex": scuola_nome.split(" ")[0], "$options": "i"}})
        if school:
            codice_scuola = school.get("codice", "")
            await db.users.update_one({"id": user_id}, {"$set": {"codice_scuola": codice_scuola}})
    
    if not codice_scuola:
        return {"error": "Codice scuola non trovato", "user_classe": user_classe}
    
    # === GESTIONE CICLI SCOLASTICI ===
    # Scuola media (primo grado): ciclo unico 1-2-3
    # Scuola superiore (secondo grado): 
    #   - Biennio: 1-2
    #   - Triennio: 3-4-5
    
    def get_cycle_info(classe: int, tipo_scuola: str):
        """
        Restituisce info sul ciclo: (classe_min, classe_max, nome_ciclo)
        """
        if tipo_scuola == "primo_grado":
            # Scuola media: ciclo unico 1-2-3
            return (1, 3, "media")
        else:
            # Scuola superiore
            if classe <= 2:
                return (1, 2, "biennio")
            else:
                return (3, 5, "triennio")
    
    cycle_min, cycle_max, cycle_name = get_cycle_info(user_classe, user_tipo)
    
    # Classi adiacenti NELLO STESSO CICLO
    classe_precedente = user_classe - 1 if user_classe > cycle_min else None
    classe_successiva = user_classe + 1 if user_classe < cycle_max else None
    
    # === LIBRI DELLA MIA SCUOLA per ogni classe ===
    
    # I MIEI libri (classe attuale) - SOLO ANNUALI
    my_books = await db.books.find({
        "scuole_adottanti": codice_scuola,
        "anni_corso": user_classe,
        "is_volume_unico": {"$ne": True}
    }).to_list(100)
    
    # Libri classe PRECEDENTE
    libri_prec = []
    if classe_precedente:
        libri_prec = await db.books.find({
            "scuole_adottanti": codice_scuola,
            "anni_corso": classe_precedente,
            "is_volume_unico": {"$ne": True}
        }).to_list(100)
    
    # Libri classe SUCCESSIVA
    libri_succ = []
    if classe_successiva:
        libri_succ = await db.books.find({
            "scuole_adottanti": codice_scuola,
            "anni_corso": classe_successiva,
            "is_volume_unico": {"$ne": True}
        }).to_list(100)
    
    # === Organizza per DISCIPLINA ===
    def books_by_discipline(books):
        result = {}
        for b in books:
            disc = b.get("disciplina", "").strip().upper()
            if disc and disc not in result:
                result[disc] = {
                    "isbn": b.get("isbn", ""),
                    "titolo": b.get("titolo", ""),
                    "editore": b.get("editore", "").strip().upper(),
                    "autori": b.get("autori", ""),
                    "prezzo": b.get("prezzo_copertina", 0),
                    "volume": b.get("volume", ""),
                    "titolo_base": get_series_name(b.get("titolo", ""))
                }
        return result
    
    my_books_disc = books_by_discipline(my_books)
    prec_books_disc = books_by_discipline(libri_prec)
    succ_books_disc = books_by_discipline(libri_succ)
    
    # === CALCOLA VENDIBILI (alla classe precedente) ===
    vendibili = []
    non_vendibili = []
    
    for disc, book_prec in prec_books_disc.items():
        if disc in my_books_disc:
            my_book = my_books_disc[disc]
            # Verifica stessa serie (editore + titolo base)
            if same_series(book_prec, my_book):
                vendibili.append({
                    "disciplina": disc,
                    "titolo": book_prec["titolo"][:50],
                    "editore": book_prec["editore"],
                    "prezzo_consigliato": round(book_prec["prezzo"] * 0.5, 2),
                    "status": "VENDIBILE"
                })
            else:
                non_vendibili.append({
                    "disciplina": disc,
                    "isbn": book_prec.get("isbn", ""),
                    "titolo_vecchio": book_prec["titolo"][:40],
                    "titolo_nuovo": my_book["titolo"][:40],
                    "editore_vecchio": book_prec["editore"],
                    "editore_nuovo": my_book["editore"],
                    "status": "EDIZIONE CAMBIATA"
                })
        else:
            vendibili.append({
                "disciplina": disc,
                "titolo": book_prec["titolo"][:50],
                "editore": book_prec["editore"],
                "prezzo_consigliato": round(book_prec["prezzo"] * 0.5, 2),
                "status": "VENDIBILE (solo in questa classe)"
            })
    
    # === CALCOLA COMPRARE USATO (dalla classe successiva) ===
    comprare_usato = []
    comprare_nuovo = []
    
    for disc, my_book in my_books_disc.items():
        if disc in succ_books_disc:
            book_succ = succ_books_disc[disc]
            # Verifica stessa serie
            if same_series(my_book, book_succ):
                comprare_usato.append({
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "status": "USATO DISPONIBILE"
                })
            else:
                comprare_nuovo.append({
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "prezzo": my_book["prezzo"],
                    "motivo": f"Edizione diversa dalla {classe_successiva}ª"
                })
        else:
            comprare_nuovo.append({
                "disciplina": disc,
                "titolo": my_book["titolo"][:50],
                "prezzo": my_book["prezzo"],
                "motivo": f"Materia non in {classe_successiva}ª" if classe_successiva else "Fine ciclo"
            })
    
    # === CALCOLI FINALI ===
    num_vendibili = len(vendibili)
    num_non_vendibili = len(non_vendibili)
    num_usato = len(comprare_usato)
    num_nuovo = len(comprare_nuovo)
    
    risparmio = sum(l["risparmio"] for l in comprare_usato)
    costo_nuovi = sum(l["prezzo"] for l in comprare_nuovo)
    
    return {
        "user_classe": user_classe,
        "scuola": user.get("scuola", ""),
        "codice_scuola": codice_scuola,
        "tipo_scuola": user_tipo,
        "ciclo": cycle_name,
        
        "vendere": {
            "classe_destinazione": classe_precedente,
            "totale_vendibili": num_vendibili,
            "totale_non_vendibili": num_non_vendibili,
            "libri_vendibili": vendibili,
            "libri_non_vendibili": non_vendibili
        },
        
        "comprare": {
            "classe_origine": classe_successiva,
            "totale_usati": num_usato,
            "risparmio_totale": round(risparmio, 2),
            "libri_usati": comprare_usato
        },
        
        "nuovi": {
            "totale": num_nuovo,
            "costo_totale": round(costo_nuovi, 2),
            "libri": comprare_nuovo
        },
        
        "summary": {
            "totale_miei_libri": len(my_books_disc),
            "vendibili": num_vendibili,
            "non_vendibili": num_non_vendibili,
            "usati": num_usato,
            "nuovi": num_nuovo,
            "risparmio_stimato": round(risparmio, 2),
            "costo_nuovi": round(costo_nuovi, 2),
            "ciclo_info": f"{'Scuola Media' if user_tipo == 'primo_grado' else 'Superiore'} - {cycle_name.capitalize()}"
        }
    }


@api_router.get("/profiles/{user_id}/children/{child_id}/compatibility")
async def get_child_compatibility(user_id: str, child_id: str):
    """
    Calcola la compatibilità libri per un profilo figlio specifico.
    USA LA COLLEZIONE ADOZIONI con supporto sezioni.
    """
    import re
    
    # Trova l'utente e il profilo figlio
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    # Estrai i dati del profilo figlio
    child_classe = int(child_profile.get("classe", 1))
    child_tipo = child_profile.get("tipo_scuola", "primo_grado")
    child_codice_scuola = child_profile.get("codice_scuola", "")
    child_sezione = child_profile.get("sezione", "A").upper()  # IMPORTANTE: ora usiamo la sezione!
    child_nome = child_profile.get("nome_figlio", "Figlio")
    child_scuola = child_profile.get("scuola", "")
    
    if not child_codice_scuola:
        return {
            "error": "Codice scuola non configurato per questo profilo",
            "child_name": child_nome,
            "child_classe": child_classe
        }
    
    # Funzioni helper per confronto libri
    def get_series_name(title: str) -> str:
        """Estrae il nome base della serie dal titolo"""
        title = title.upper().strip()
        # Rimuovi (LDM) e simili
        title = re.sub(r'\s*\(LDM.*?\)', '', title, flags=re.IGNORECASE)
        # Rimuovi V.1, V.2, etc
        title = re.sub(r'\s*V\.?\s*\d+', '', title, flags=re.IGNORECASE)
        # Rimuovi parte dopo +
        if '+' in title:
            title = title.split('+')[0]
        # Rimuovi VOLUME/VOL. seguito da numero e tutto ciò che segue
        title = re.sub(r'\s*-?\s*(VOLUME|VOL\.?)\s*\d+.*', '', title, flags=re.IGNORECASE)
        # Rimuovi CONF./CONFIGURAZIONE seguito da numero e tutto ciò che segue
        title = re.sub(r'\s*-?\s*(CONF\.?|CONFIGURAZIONE)\s*\d+.*', '', title, flags=re.IGNORECASE)
        # Rimuovi - seguito da numero e tutto ciò che segue
        title = re.sub(r'\s*-\s*\d+.*', '', title)
        # Rimuovi "LE SCIENZE" seguito da numero
        title = re.sub(r'\s+(LE\s+SCIENZE)\s+\d+', r' \1', title)
        # Rimuovi numero finale
        title = re.sub(r'\s+\d+\s*$', '', title)
        # Rimuovi "CON TUTOR" e simili suffissi comuni
        title = re.sub(r'\s+CON\s+TUTOR.*', '', title, flags=re.IGNORECASE)
        # Filtra parole specifiche per anno
        words = title.split()
        if len(words) > 1:
            anno_specific = {'ARITMETICA', 'ALGEBRA', 'GEOMETRIA', 'ANTOLOGIA', 'LETTERATURA'}
            words = [w for w in words if w not in anno_specific]
        title = ' '.join(words).strip()
        # Rimuovi trattino finale
        title = re.sub(r'\s*-\s*$', '', title).strip()
        return title
    
    def has_edition_marker(title: str) -> str:
        """Estrae il marker di edizione dal titolo"""
        title = title.upper()
        match = re.search(r'(\d+ED\.?|EDIZIONE\s+\w+|ED\.\s*\w+)', title)
        return match.group(1) if match else ""
    
    def same_series(book1: dict, book2: dict) -> bool:
        """Verifica se due libri sono della stessa serie/edizione"""
        if book1.get("editore", "").upper() != book2.get("editore", "").upper():
            return False
        t1 = book1.get("titolo", "").upper()
        t2 = book2.get("titolo", "").upper()
        ed1 = has_edition_marker(t1)
        ed2 = has_edition_marker(t2)
        if ed1 != ed2:
            return False
        series1 = get_series_name(t1)
        series2 = get_series_name(t2)
        if series1 == series2:
            return True
        words1 = set(series1.split())
        words2 = set(series2.split())
        words1.discard('-')
        words2.discard('-')
        if not words1 or not words2:
            return False
        common = words1.intersection(words2)
        min_words = min(len(words1), len(words2))
        similarity = len(common) / max(len(words1), len(words2))
        return similarity >= 0.7 and len(common) >= min(2, min_words)
    
    # Gestione cicli scolastici
    def get_cycle_info(classe: int, tipo_scuola: str):
        """Restituisce (min_classe, max_classe, nome_ciclo)"""
        if tipo_scuola == "primo_grado":
            return (1, 3, "media")
        else:
            if classe <= 2:
                return (1, 2, "biennio")
            else:
                return (3, 5, "triennio")
    
    cycle_min, cycle_max, cycle_name = get_cycle_info(child_classe, child_tipo)
    classe_precedente = child_classe - 1 if child_classe > cycle_min else None
    classe_successiva = child_classe + 1 if child_classe < cycle_max else None
    
    # ========================================
    # LOGICA COMPLETA LIBRI - SCUOLA MEDIA INFERIORE
    # ========================================
    
    def normalize_for_comparison(text: str) -> str:
        """Normalizza un testo per il confronto (rimuove spazi extra, maiuscolo)"""
        if not text:
            return ""
        import re
        text = text.upper().strip()
        text = re.sub(r'\s+', ' ', text)
        return text
    
    def get_libro_base_info(libro: dict) -> dict:
        """Estrae le informazioni base di un libro per il confronto"""
        import re
        titolo = normalize_for_comparison(libro.get('titolo', ''))
        # Rimuovi numeri di volume dal titolo per confronto
        titolo_base = re.sub(r'\s+(VOL\.?\s*)?[123](\s|$)', ' ', titolo)
        titolo_base = re.sub(r'\s+VOLUME\s+[123]', ' ', titolo_base)
        titolo_base = re.sub(r'\s+(ARITMETICA|GEOMETRIA)\s+[123]', r' \1', titolo_base)
        titolo_base = re.sub(r'\s*\([^)]*\)', '', titolo_base)  # Rimuovi parentesi
        titolo_base = titolo_base.strip()[:40]  # Primi 40 caratteri
        
        return {
            'titolo_base': titolo_base,
            'autori': normalize_for_comparison(libro.get('autori', '')),
            'editore': normalize_for_comparison(libro.get('editore', '')),
            'edizione': normalize_for_comparison(str(libro.get('edizione', ''))),
        }
    
    def libri_sono_stesso_ciclo(libro1: dict, libro2: dict) -> bool:
        """
        Verifica se due libri appartengono allo stesso ciclo editoriale.
        Stessi: titolo base, autori, editore, edizione
        """
        info1 = get_libro_base_info(libro1)
        info2 = get_libro_base_info(libro2)
        
        # Confronta titolo base (primi 20 caratteri per flessibilità)
        if info1['titolo_base'][:20] != info2['titolo_base'][:20]:
            return False
        
        # Confronta editore (richiesto)
        if info1['editore'][:15] != info2['editore'][:15]:
            return False
        
        # Autori e edizione sono opzionali ma se presenti devono corrispondere
        if info1['autori'] and info2['autori']:
            if info1['autori'][:20] != info2['autori'][:20]:
                return False
        
        return True
    
    async def classifica_libro(libro: dict, classe_corrente: int, codice_scuola: str, disciplina: str) -> dict:
        """
        Classifica un libro secondo la logica:
        - UNICO: stesso libro in tutte e 3 le classi
        - ANNUALE_COMPATIBILE: stesso ciclo editoriale, cambia volume
        - ANNUALE_NON_COMPATIBILE: nuova edizione, libro diverso
        
        Ritorna: {
            "tipo": "unico" | "annuale_compatibile" | "annuale_non_compatibile",
            "stato": "da_acquistare" | "gia_posseduto",
            "acquistabile_usato": bool,
            "vendibile": bool
        }
        """
        is_volume_unico = libro.get('is_volume_unico', False)
        
        # CASO 1: LIBRO UNICO (già marcato nel DB o rilevato)
        if is_volume_unico:
            if classe_corrente == 1:
                # Prima media: deve acquistare, può comprare usato da chi ha finito 3ª
                return {
                    "tipo": "unico",
                    "stato": "da_acquistare",
                    "acquistabile_usato": True,  # Da chi ha finito la 3ª
                    "vendibile": False  # Non può vendere, lo userà per 3 anni
                }
            else:
                # Seconda o terza: già posseduto
                return {
                    "tipo": "unico",
                    "stato": "gia_posseduto",
                    "acquistabile_usato": False,
                    "vendibile": classe_corrente == 3  # Solo dopo la 3ª può vendere
                }
        
        # CASO 2: LIBRO ANNUALE - verifica se compatibile
        # Cerca lo stesso libro nelle altre classi della stessa scuola
        libri_altre_classi = []
        for classe in [1, 2, 3]:
            if classe == classe_corrente:
                continue
            adoz = await db.adozioni.find_one({
                'codice_scuola': codice_scuola,
                'classe': classe
            })
            if adoz:
                for l in adoz.get('libri', []):
                    if disciplina.upper() in l.get('disciplina', '').upper():
                        libri_altre_classi.append({'classe': classe, 'libro': l})
        
        # Verifica compatibilità con libri delle altre classi
        ha_libro_compatibile = False
        for item in libri_altre_classi:
            if libri_sono_stesso_ciclo(libro, item['libro']):
                ha_libro_compatibile = True
                break
        
        if ha_libro_compatibile:
            # ANNUALE COMPATIBILE - stesso ciclo editoriale
            return {
                "tipo": "annuale_compatibile",
                "stato": "da_acquistare",
                "acquistabile_usato": True,  # Volume precedente da studenti anno prima
                "vendibile": True  # Può vendere a studenti anno dopo
            }
        else:
            # ANNUALE NON COMPATIBILE - nuova edizione
            return {
                "tipo": "annuale_non_compatibile",
                "stato": "da_acquistare",
                "acquistabile_usato": False,  # Non disponibile usato
                "vendibile": False  # Non vendibile
            }
    
    async def libro_acquistabile_usato(libro: dict, classe_corrente: int, codice_scuola: str, disciplina: str) -> dict:
        """
        Determina se un libro è acquistabile usato e da chi.
        Ritorna info sulla disponibilità usato.
        """
        classificazione = await classifica_libro(libro, classe_corrente, codice_scuola, disciplina)
        
        isbn = libro.get('isbn', '')
        copie_disponibili = 0
        if isbn:
            copie_disponibili = await db.listings.count_documents({
                "book_isbn": isbn,
                "status": "available"
            })
        
        return {
            **classificazione,
            "copie_disponibili": copie_disponibili,
            "potenzialmente_disponibile": classificazione["acquistabile_usato"] and copie_disponibili == 0
        }
    
    # ========================================
    # FUNZIONE HELPER: VERIFICA SE STESSO LIBRO IN CLASSI SUPERIORI
    # ========================================
    
    async def is_same_book_in_higher_classes(libro: dict, codice_scuola: str, disciplina: str, tipo_scuola: str, classe_corrente: int = 1) -> bool:
        """
        Verifica se un VOLUME UNICO può essere trovato USATO.
        
        LOGICA PER SCUOLE MEDIE (primo_grado):
        - Volumi unici TRIENNALI (1-2-3)
        - Deve essere LO STESSO libro in 2ª E 3ª
        - Controllo anno pubblicazione: se <= 2022, ha completato un ciclo
        
        LOGICA PER SCUOLE SUPERIORI (secondo_grado):
        - Materie a DURATA FISSA 5 ANNI: Scienze motorie, Religione, Ed. civica, Grammatiche
        - Altre materie: controllo DINAMICO sulla classe_successiva
          - Se la materia esiste nella classe successiva → il libro continua
          - Se NON esiste → ciclo terminato (libro usabile solo quest'anno)
        - BIENNIO (1-2): logica simile alle medie per libri annuali
        - TRIENNIO (3-4-5): logica simile alle medie per libri annuali
        """
        import re
        
        # PRIORITÀ 1: Controllo anno di pubblicazione (se disponibile)
        anno_pubblicazione = libro.get('anno_pubblicazione')
        if anno_pubblicazione:
            # Anno scolastico 2025-2026: libri pubblicati nel 2022 o prima hanno completato almeno un ciclo
            if anno_pubblicazione <= 2022:
                # Libro vecchio, ma dobbiamo ancora verificare che sia lo stesso nelle classi superiori
                pass  # Continua con la verifica del titolo
            else:
                # Libro pubblicato 2023 o dopo: primo ciclo in corso, NON disponibile usato
                return False
        
        # Se il libro ha nuova_adozione=True, NON può essere comprato usato
        if libro.get('nuova_adozione', False):
            return False
        
        titolo = libro.get('titolo', '').upper()
        editore = libro.get('editore', '').upper()[:15]
        
        # Rimuovi suffissi dal titolo per confronto
        titolo_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo)
        titolo_base = re.sub(r'\s*\([^)]*\)', '', titolo_base)
        titolo_base = titolo_base.strip()[:25]
        
        if not titolo_base:
            return False
        
        # ===========================================
        # SCUOLE MEDIE (primo_grado) - Volumi unici TRIENNALI
        # ===========================================
        if tipo_scuola == "primo_grado":
            same_in_class_2 = False
            same_in_class_3 = False
            nuova_adozione_in_2 = False
            nuova_adozione_in_3 = False
            
            for classe in [2, 3]:
                adoz = await db.adozioni.find_one({
                    'codice_scuola': codice_scuola,
                    'classe': classe
                })
                
                if not adoz:
                    continue
                
                for libro_sup in adoz.get('libri', []):
                    # Cerca nella stessa disciplina E deve essere volume unico
                    if disciplina.upper()[:15] not in libro_sup.get('disciplina', '').upper():
                        continue
                    if not libro_sup.get('is_volume_unico', False):
                        continue
                    
                    # Confronta titolo ed editore
                    titolo_sup = libro_sup.get('titolo', '').upper()
                    editore_sup = libro_sup.get('editore', '').upper()[:15]
                    
                    titolo_sup_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo_sup)
                    titolo_sup_base = re.sub(r'\s*\([^)]*\)', '', titolo_sup_base)
                    titolo_sup_base = titolo_sup_base.strip()[:25]
                    
                    # Verifica se è LO STESSO libro
                    if titolo_base[:15] == titolo_sup_base[:15] and editore == editore_sup:
                        if classe == 2:
                            same_in_class_2 = True
                            nuova_adozione_in_2 = libro_sup.get('nuova_adozione', False)
                        else:
                            same_in_class_3 = True
                            nuova_adozione_in_3 = libro_sup.get('nuova_adozione', False)
                        break
            
            # Se il libro in 3ª ha nuova_adozione=True → è al 1° anno → NON disponibile
            if nuova_adozione_in_3:
                return False
            
            # Se il libro in 2ª ha nuova_adozione=True → è al 2° anno → NON disponibile
            if nuova_adozione_in_2:
                return False
            
            # Può comprare usato SOLO se è lo stesso libro in ENTRAMBE le classi 2 e 3
            return same_in_class_2 and same_in_class_3
        
        # ===========================================
        # SCUOLE SUPERIORI (secondo_grado) - Logica NUOVA
        # ===========================================
        else:
            disciplina_upper = disciplina.upper()
            
            # MATERIE A DURATA FISSA 5 ANNI
            # Queste materie usano lo stesso libro per tutti i 5 anni
            MATERIE_5_ANNI = [
                'SCIENZE MOTORIE', 'EDUCAZIONE FISICA', 'ED. FISICA',
                'RELIGIONE', 'IRC', 'RELIGIONE CATTOLICA',
                'EDUCAZIONE CIVICA', 'ED. CIVICA', 'CITTADINANZA',
                'GRAMMATICA', 'GRAMMATICHE', 'LINGUA ITALIANA - GRAMMATICA'
            ]
            
            is_materia_5_anni = any(mat in disciplina_upper for mat in MATERIE_5_ANNI)
            
            if is_materia_5_anni:
                # Materia a 5 anni: verifica se è lo stesso libro in TUTTE le classi successive
                # Per essere disponibile usato, deve essere stato adottato per almeno 5 anni
                classi_da_verificare = [c for c in range(2, 6) if c > classe_corrente]
                
                if not classi_da_verificare:
                    # Siamo in 5ª, non ci sono classi successive
                    # Verifichiamo se è lo stesso libro nelle classi precedenti (significa che ha completato cicli)
                    classi_da_verificare = [c for c in range(1, 5) if c < classe_corrente]
                
                stesso_libro_ovunque = True
                nuova_adozione_trovata = False
                
                for classe in classi_da_verificare:
                    adoz = await db.adozioni.find_one({
                        'codice_scuola': codice_scuola,
                        'classe': classe
                    })
                    
                    if not adoz:
                        continue
                    
                    trovato_in_classe = False
                    for libro_sup in adoz.get('libri', []):
                        if disciplina_upper[:15] not in libro_sup.get('disciplina', '').upper():
                            continue
                        if not libro_sup.get('is_volume_unico', False):
                            continue
                        
                        titolo_sup = libro_sup.get('titolo', '').upper()
                        editore_sup = libro_sup.get('editore', '').upper()[:15]
                        
                        titolo_sup_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo_sup)
                        titolo_sup_base = re.sub(r'\s*\([^)]*\)', '', titolo_sup_base)
                        titolo_sup_base = titolo_sup_base.strip()[:25]
                        
                        if titolo_base[:15] == titolo_sup_base[:15] and editore == editore_sup:
                            trovato_in_classe = True
                            if libro_sup.get('nuova_adozione', False):
                                nuova_adozione_trovata = True
                            break
                    
                    if not trovato_in_classe:
                        stesso_libro_ovunque = False
                
                # Se c'è nuova_adozione in qualsiasi classe, il ciclo non è completo
                if nuova_adozione_trovata:
                    return False
                
                return stesso_libro_ovunque
            
            else:
                # ALTRE MATERIE: Controllo DINAMICO sulla classe_successiva
                # Determina il ciclo corrente (biennio o triennio)
                if classe_corrente <= 2:
                    # BIENNIO (1-2)
                    classi_ciclo = [1, 2]
                    classi_da_verificare = [c for c in classi_ciclo if c > classe_corrente]
                else:
                    # TRIENNIO (3-4-5)
                    classi_ciclo = [3, 4, 5]
                    classi_da_verificare = [c for c in classi_ciclo if c > classe_corrente]
                
                # Verifica se la materia continua nelle classi successive del ciclo
                # E se è lo stesso libro
                for classe in classi_da_verificare:
                    adoz = await db.adozioni.find_one({
                        'codice_scuola': codice_scuola,
                        'classe': classe
                    })
                    
                    if not adoz:
                        # Se non c'è adozione per questa classe, la materia potrebbe non continuare
                        return False
                    
                    # Cerca se la materia esiste in questa classe
                    materia_trovata = False
                    stesso_libro = False
                    nuova_adozione = False
                    
                    for libro_sup in adoz.get('libri', []):
                        disc_sup = libro_sup.get('disciplina', '').upper()
                        if disciplina_upper[:15] not in disc_sup:
                            continue
                        
                        materia_trovata = True
                        
                        # Verifica se è lo stesso libro (volume unico)
                        if libro_sup.get('is_volume_unico', False):
                            titolo_sup = libro_sup.get('titolo', '').upper()
                            editore_sup = libro_sup.get('editore', '').upper()[:15]
                            
                            titolo_sup_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo_sup)
                            titolo_sup_base = re.sub(r'\s*\([^)]*\)', '', titolo_sup_base)
                            titolo_sup_base = titolo_sup_base.strip()[:25]
                            
                            if titolo_base[:15] == titolo_sup_base[:15] and editore == editore_sup:
                                stesso_libro = True
                                nuova_adozione = libro_sup.get('nuova_adozione', False)
                        break
                    
                    # Se la materia non è presente nella classe successiva, il ciclo del libro termina
                    if not materia_trovata:
                        # Il libro viene usato solo fino a questa classe
                        # Ma per essere disponibile usato, deve aver completato almeno un ciclo
                        # Verifica nelle classi precedenti
                        break
                    
                    # Se è una nuova adozione, non è disponibile usato
                    if nuova_adozione:
                        return False
                    
                    # Se non è lo stesso libro, l'edizione è cambiata
                    if not stesso_libro:
                        return False
                
                # Se siamo arrivati qui, verifichiamo che il libro sia stato adottato abbastanza a lungo
                # Controlliamo nelle classi precedenti per vedere se il ciclo è stato completato
                if classe_corrente <= 2:
                    classi_precedenti = [c for c in [1, 2] if c < classe_corrente]
                else:
                    classi_precedenti = [c for c in [3, 4, 5] if c < classe_corrente]
                
                ciclo_completo = False
                for classe in classi_precedenti:
                    adoz = await db.adozioni.find_one({
                        'codice_scuola': codice_scuola,
                        'classe': classe
                    })
                    if adoz:
                        for libro_prec in adoz.get('libri', []):
                            if disciplina_upper[:15] in libro_prec.get('disciplina', '').upper():
                                if libro_prec.get('is_volume_unico', False):
                                    titolo_prec = libro_prec.get('titolo', '').upper()
                                    editore_prec = libro_prec.get('editore', '').upper()[:15]
                                    titolo_prec_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo_prec)
                                    titolo_prec_base = re.sub(r'\s*\([^)]*\)', '', titolo_prec_base)
                                    titolo_prec_base = titolo_prec_base.strip()[:25]
                                    
                                    if titolo_base[:15] == titolo_prec_base[:15] and editore == editore_prec:
                                        if not libro_prec.get('nuova_adozione', False):
                                            ciclo_completo = True
                                break
                
                # Per la prima classe del ciclo (1 o 3), se il libro è presente in tutte le classi successive
                # E non è nuova adozione, potrebbe essere disponibile usato da chi ha completato il ciclo
                if classe_corrente in [1, 3]:
                    # Verifica se tutte le classi del ciclo hanno lo stesso libro
                    if classe_corrente == 1:
                        classi_verificare = [2]
                    else:
                        classi_verificare = [4, 5]
                    
                    presente_ovunque = True
                    for classe in classi_verificare:
                        adoz = await db.adozioni.find_one({
                            'codice_scuola': codice_scuola,
                            'classe': classe
                        })
                        if not adoz:
                            presente_ovunque = False
                            break
                        
                        trovato = False
                        for libro_sup in adoz.get('libri', []):
                            if disciplina_upper[:15] in libro_sup.get('disciplina', '').upper():
                                if libro_sup.get('is_volume_unico', False):
                                    titolo_sup = libro_sup.get('titolo', '').upper()
                                    editore_sup = libro_sup.get('editore', '').upper()[:15]
                                    titolo_sup_base = re.sub(r'\s*-\s*(VOLUME|VOL\.?|CONFEZIONE|EDIZIONE|ED\.).*', '', titolo_sup)
                                    titolo_sup_base = re.sub(r'\s*\([^)]*\)', '', titolo_sup_base)
                                    titolo_sup_base = titolo_sup_base.strip()[:25]
                                    
                                    if titolo_base[:15] == titolo_sup_base[:15] and editore == editore_sup:
                                        if not libro_sup.get('nuova_adozione', False):
                                            trovato = True
                                break
                        
                        if not trovato:
                            presente_ovunque = False
                            break
                    
                    return presente_ovunque
                
                return ciclo_completo
    
    # ========================================
    # FUNZIONE HELPER: VERIFICA POTENZIALE USATO (legacy - mantenuta per compatibilità)
    # ========================================
    async def is_potentially_available_used(isbn: str, current_class: int, tipo_scuola: str, titolo: str = "", disciplina: str = "", codice_scuola: str = "") -> bool:
        """
        Verifica se un libro ANNUALE è potenzialmente disponibile usato.
        Cerca nelle adozioni di TUTTE le scuole dello stesso tipo (primo/secondo grado)
        se il libro (o uno della stessa serie) è stato adottato in classi superiori.
        
        Per libri annuali (vol. 1, 2, 3), cerca se la STESSA SERIE è adottata in classi superiori.
        
        NOTA: Questa funzione è per libri ANNUALI. Per volumi UNICI usare is_same_book_in_higher_classes.
        """
        if not isbn and not titolo:
            return False
        
        # Classi superiori a quella corrente (all'interno dello stesso ciclo)
        if tipo_scuola == "primo_grado":
            # Medie: ciclo unico 1-2-3
            classi_superiori = [c for c in [2, 3] if c > current_class]
        else:
            # Superiori: rispetta i cicli biennio (1-2) e triennio (3-4-5)
            if current_class <= 2:
                # Biennio: cerca solo in classe 2 (dentro il biennio)
                classi_superiori = [2] if current_class == 1 else []
            else:
                # Triennio: cerca in 4 e 5 (dentro il triennio)
                classi_superiori = [c for c in [4, 5] if c > current_class]
        
        if not classi_superiori:
            return False
        
        # Prima cerca per ISBN esatto
        count = await db.adozioni.count_documents({
            "classe": {"$in": classi_superiori},
            "libri.isbn": isbn
        })
        
        if count > 0:
            return True
        
        # Se non trova per ISBN, cerca per SERIE (stesso titolo base + stessa disciplina)
        # Prima cerca nella STESSA SCUOLA, poi in tutte le scuole
        if titolo and disciplina:
            import re
            # Rimuovi numeri di volume, parentesi, suffissi, ecc.
            titolo_base = titolo.upper()
            # Rimuovi parentesi e contenuto
            titolo_base = re.sub(r'\s*\([^)]*\)', '', titolo_base)
            # Rimuovi numeri di volume
            titolo_base = re.sub(r'\s+(VOL\.?\s*)?[123](\s|$)', ' ', titolo_base)
            titolo_base = re.sub(r'\s+VOLUME\s+[123]', ' ', titolo_base)
            titolo_base = re.sub(r'\s+[123]°?\s+(ANNO|VOL)', ' ', titolo_base)
            # Rimuovi "ARITMETICA/GEOMETRIA 1/2/3"
            titolo_base = re.sub(r'\s+(ARITMETICA|GEOMETRIA|ALGEBRA)\s+[123]', r' \1', titolo_base)
            titolo_base = titolo_base.strip()
            
            if titolo_base:
                # PRIMA cerca nella stessa scuola (più probabile)
                if codice_scuola:
                    adozioni_stessa_scuola = await db.adozioni.find({
                        "codice_scuola": codice_scuola,
                        "classe": {"$in": classi_superiori}
                    }).to_list(50)
                    
                    for adoz in adozioni_stessa_scuola:
                        for libro in adoz.get('libri', []):
                            if disciplina.upper() in libro.get('disciplina', '').upper():
                                titolo_libro = libro.get('titolo', '').upper()
                                titolo_libro = re.sub(r'\s*\([^)]*\)', '', titolo_libro)
                                # Verifica se è la stessa serie
                                if titolo_base[:12] in titolo_libro or titolo_libro[:12] in titolo_base:
                                    return True
                
                # POI cerca in tutte le scuole
                adozioni = await db.adozioni.find({
                    "classe": {"$in": classi_superiori},
                    "libri.disciplina": {"$regex": disciplina.upper()[:10], "$options": "i"}
                }).to_list(200)
                
                for adoz in adozioni:
                    for libro in adoz.get('libri', []):
                        if disciplina.upper()[:10] in libro.get('disciplina', '').upper():
                            titolo_libro = libro.get('titolo', '').upper()
                            titolo_libro = re.sub(r'\s*\([^)]*\)', '', titolo_libro)
                            if titolo_base[:12] in titolo_libro or titolo_libro[:12] in titolo_base:
                                return True
        
        return False
    
    # ========================================
    # NUOVA LOGICA: USA COLLEZIONE ADOZIONI
    # ========================================
    
    async def get_books_from_adozioni(codice_scuola: str, classe: int, sezione: str) -> list:
        """Recupera libri dalla collezione adozioni per una specifica combinazione.
        Se la sezione non esiste, usa la prima sezione disponibile (fallback)."""
        # Prima prova con la sezione esatta
        adozione = await db.adozioni.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe,
            "sezione": sezione.upper()
        })
        if adozione:
            return adozione.get('libri', [])
        
        # FALLBACK: Se la sezione non esiste, usa qualsiasi sezione disponibile per quella classe
        adozione_fallback = await db.adozioni.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe
        })
        if adozione_fallback:
            return adozione_fallback.get('libri', [])
        
        return []
    
    # Carica libri della MIA classe/sezione
    all_my_books = await get_books_from_adozioni(child_codice_scuola, child_classe, child_sezione)
    
    # Separa libri in categorie:
    # 1. Libri da acquistare obbligatori (da_acquistare=True) - NON volumi unici
    # 2. Libri consigliati o da non acquistare (da_acquistare=False o consigliato=True) - inclusi volumi unici
    # 3. Volumi unici obbligatori
    
    # Prima carica libri classe precedente per verificare continuità serie
    all_libri_prec = []
    if classe_precedente:
        all_libri_prec = await get_books_from_adozioni(child_codice_scuola, classe_precedente, child_sezione)
    
    # Funzione per verificare se un libro "consigliato" è in realtà da acquistare
    # perché è la continuazione di una serie dalla classe precedente
    def is_continuation_from_previous(libro, libri_precedenti):
        """
        Un libro marcato come 'consigliato' o 'da non acquistare' è in realtà
        DA ACQUISTARE se:
        1. NON è un volume unico
        2. Ha un volume > 1 (es. Vol. 2, Vol. 3)
        3. Nella classe precedente c'era lo stesso libro con volume inferiore
        """
        if libro.get('is_volume_unico'):
            return False
        
        volume = libro.get('volume', '')
        # Verifica se è un volume annuale (2, 3, 4, 5, etc.)
        try:
            vol_num = int(volume) if volume else 0
        except:
            vol_num = 0
        
        if vol_num <= 1:
            return False
        
        # Cerca se nella classe precedente c'era lo stesso libro con volume precedente
        titolo_base = get_series_name(libro.get('titolo', ''))
        editore = libro.get('editore', '').upper()
        disciplina = libro.get('disciplina', '').upper()
        
        for libro_prec in libri_precedenti:
            if libro_prec.get('is_volume_unico'):
                continue
            
            titolo_prec_base = get_series_name(libro_prec.get('titolo', ''))
            editore_prec = libro_prec.get('editore', '').upper()
            disciplina_prec = libro_prec.get('disciplina', '').upper()
            
            # Stessa serie se stesso editore e disciplina con titolo simile
            if editore == editore_prec and disciplina == disciplina_prec:
                # Verifica similarità titolo
                if titolo_base == titolo_prec_base or (len(titolo_base) > 3 and titolo_base in titolo_prec_base) or (len(titolo_prec_base) > 3 and titolo_prec_base in titolo_base):
                    return True
        
        return False
    
    # Separa i libri
    my_books = []
    my_books_consigliati = []
    
    # MATERIE A DURATA FISSA 5 ANNI per le superiori
    MATERIE_5_ANNI_KEYWORDS = [
        'SCIENZE MOTORIE', 'EDUCAZIONE FISICA', 'ED. FISICA',
        'RELIGIONE', 'IRC', 'RELIGIONE CATTOLICA',
        'EDUCAZIONE CIVICA', 'ED. CIVICA', 'CITTADINANZA',
        'GRAMMATICA', 'GRAMMATICHE', 'LINGUA ITALIANA - GRAMMATICA'
    ]
    
    def is_materia_5_anni(disciplina: str) -> bool:
        """Verifica se una materia è quinquennale"""
        disc_upper = disciplina.upper()
        return any(mat in disc_upper for mat in MATERIE_5_ANNI_KEYWORDS)
    
    # CASO SPECIALE per SCUOLE MEDIE INFERIORI (primo_grado):
    # I libri CONSIGLIATI vanno trattati come OBBLIGATORI
    # Quindi per primo_grado, tutti i libri (consigliati + obbligatori) vanno in my_books
    
    # Per prima classe, TUTTI i libri vanno acquistati
    is_prima_classe = (child_classe == 1)
    is_scuola_media = (child_tipo == "primo_grado")
    
    for libro in all_my_books:
        if is_scuola_media:
            # SCUOLA MEDIA: i consigliati vanno trattati come obbligatori
            if is_prima_classe:
                # Prima media: TUTTI i libri vanno acquistati
                my_books.append(libro)
            else:
                # Seconda/terza media: solo libri ANNUALI (non volumi unici)
                if libro.get('da_acquistare', True) == True or libro.get('consigliato') == True:
                    # Sia obbligatori che consigliati vanno in my_books
                    if not libro.get('is_volume_unico'):
                        my_books.append(libro)
                    # I volumi unici non vanno acquistati in 2ª/3ª
                elif libro.get('is_volume_unico'):
                    # Volume unico in 2ª/3ª - già comprato
                    pass
                else:
                    my_books.append(libro)
        else:
            # SUPERIORI: logica aggiornata
            # REGOLA IMPORTANTE: Alle superiori i libri "consigliati" (specialmente volumi unici) 
            # sono in realtà DA ACQUISTARE - le scuole usano questo trucco per eludere il tetto di spesa
            disciplina = libro.get('disciplina', '').upper()
            is_volume_unico = libro.get('is_volume_unico', False)
            is_materia_quinquennale = is_materia_5_anni(disciplina)
            is_consigliato = libro.get('consigliato') == True
            
            if is_prima_classe:
                # In prima superiore, TUTTI i libri vanno acquistati (inclusi consigliati)
                my_books.append(libro)
            elif child_classe == 3:
                # In terza superiore:
                # - Materie quinquennali (Religione, Sc. Motorie, Ed. Civica, Grammatica): già comprate in 1ª
                # - Altre materie: se il libro è consigliato O da_acquistare, va acquistato
                # - Volumi unici NON quinquennali: inizio triennio, vanno acquistati
                if is_volume_unico and is_materia_quinquennale:
                    # Volume unico quinquennale - già comprato in 1ª, NON va acquistato
                    pass  # Non lo aggiungo a nessuna lista - è già posseduto
                elif libro.get('da_acquistare', True) == True or is_consigliato:
                    # Sia obbligatori che consigliati vanno acquistati
                    my_books.append(libro)
                elif is_continuation_from_previous(libro, all_libri_prec):
                    my_books.append(libro)
                # else: libro non da acquistare e non consigliato - ignoriamo
            else:
                # Classi 2, 4, 5
                if is_volume_unico:
                    if is_materia_quinquennale:
                        # Volume unico quinquennale - già comprato in 1ª
                        pass  # Già posseduto
                    else:
                        # Volume unico NON quinquennale
                        if child_classe == 2:
                            # In 2ª - volume unico del biennio già comprato in 1ª
                            pass  # Già posseduto
                        else:
                            # In 4ª/5ª - volume unico del triennio già comprato in 3ª
                            pass  # Già posseduto
                elif libro.get('da_acquistare', True) == True or is_consigliato:
                    # Libri annuali (non volumi unici): vanno acquistati
                    my_books.append(libro)
                elif is_continuation_from_previous(libro, all_libri_prec):
                    my_books.append(libro)
                # else: ignoriamo
    
    # In 1ª classe non ci sono volumi unici extra, sono già inclusi in my_books
    if is_prima_classe:
        my_volumi_unici = []  # Già inclusi in my_books
    else:
        # Volumi unici obbligatori - già inclusi in my_books
        my_volumi_unici = []
    
    # Carica libri della classe PRECEDENTE (stessa sezione) - per calcolare cosa posso VENDERE
    libri_prec = []
    libri_prec_consigliati = []
    if classe_precedente:
        for libro in all_libri_prec:
            if libro.get('is_volume_unico'):
                if libro.get('da_acquistare', True) == False or libro.get('consigliato', False) == True:
                    libri_prec_consigliati.append(libro)
            else:
                if libro.get('da_acquistare', True) == True:
                    libri_prec.append(libro)
                else:
                    # Verifica se era continuazione (per poterlo vendere)
                    # Carica libri di 2 classi prima se possibile
                    libri_prec_consigliati.append(libro)
    
    # Carica libri della classe SUCCESSIVA (stessa sezione) - per calcolare cosa posso COMPRARE USATO
    libri_succ = []
    all_libri_succ = []  # Inizializza anche all_libri_succ
    if classe_successiva:
        all_libri_succ = await get_books_from_adozioni(child_codice_scuola, classe_successiva, child_sezione)
        libri_succ = [b for b in all_libri_succ if not b.get('is_volume_unico')]
    
    # VOLUMI UNICI: da comprare solo al primo anno del ciclo
    volumi_unici_da_comprare = []
    deve_comprare_volumi_unici = False
    
    if child_tipo == "primo_grado":
        # Medie: volumi unici triennali (1-2-3), comprare solo in 1ª
        deve_comprare_volumi_unici = (child_classe == 1)
        anni_coperti = [1, 2, 3]
    else:
        # SUPERIORI: logica differenziata per materie quinquennali e altre
        # La logica completa viene gestita libro per libro sotto
        if child_classe == 1:
            deve_comprare_volumi_unici = True
            # Gli anni coperti dipendono dalla materia (verrà gestito sotto)
            anni_coperti = [1, 2]  # Default per biennio, poi gestito caso per caso
        elif child_classe == 3:
            # Triennio: solo libri NON quinquennali vanno comprati in 3ª
            deve_comprare_volumi_unici = True
            anni_coperti = [3, 4, 5]
        else:
            deve_comprare_volumi_unici = False
            anni_coperti = []
    
    if deve_comprare_volumi_unici:
        for vu in my_volumi_unici:
            volumi_unici_da_comprare.append({
                "isbn": vu.get("isbn", ""),
                "titolo": vu.get("titolo", ""),
                "disciplina": vu.get("disciplina", ""),
                "editore": vu.get("editore", ""),
                "prezzo": vu.get("prezzo_copertina", 0),
                "anni_coperti": anni_coperti,
                "tipo": "volume_unico"
            })
    
    # Organizza per disciplina - NON unisce libri diversi della stessa disciplina
    # Usa ISBN come chiave primaria per distinguere libri diversi
    def books_by_discipline(books, merge_duplicates=False):
        result = {}
        for b in books:
            disc = b.get("disciplina", "").strip().upper()
            isbn = b.get("isbn", "")
            titolo = b.get("titolo", "")
            
            # Usa ISBN come chiave primaria se disponibile, altrimenti disciplina + titolo
            if isbn:
                key = isbn
            else:
                titolo_key = titolo.upper()[:20].replace(" ", "_") if titolo else "UNKNOWN"
                key = f"{disc}_{titolo_key}"
            
            if key and key not in result:
                result[key] = {
                    "isbn": isbn,
                    "titolo": titolo,
                    "editore": b.get("editore", "").strip().upper(),
                    "autori": b.get("autori", ""),
                    "prezzo": b.get("prezzo_copertina", 0),
                    "titolo_base": get_series_name(titolo),
                    "libri_multipli": [b],
                    "is_volume_unico": b.get("is_volume_unico", False),
                    "nuova_adozione": b.get("nuova_adozione", False),
                    "disciplina_originale": disc  # Mantiene la disciplina originale
                }
        return result
    
    my_books_disc = books_by_discipline(my_books)
    prec_books_disc = books_by_discipline(libri_prec)
    succ_books_disc = books_by_discipline(libri_succ)
    
    # Calcola vendere - con ISBN
    # LOGICA CORRETTA: i libri VENDIBILI sono quelli della CLASSE PRECEDENTE (che lo studente ha già usato)
    # Confrontiamo con la classe attuale per verificare compatibilità serie/edizione
    # SUPERIORI: un volume unico NON è vendibile se serve ancora nella classe successiva
    vendibili = []
    non_vendibili = []
    
    for key_prec, book_prec in prec_books_disc.items():  # Itera sui libri della classe PRECEDENTE
        disc_prec = book_prec.get("disciplina_originale", "")
        is_volume_unico_prec = book_prec.get("is_volume_unico", False)
        
        # Trova il libro corrispondente nella classe attuale cercando per disciplina
        my_book = None
        for key, mb in my_books_disc.items():
            disc_my = mb.get("disciplina_originale", "")
            if disc_prec and disc_my and disc_prec.upper()[:15] == disc_my.upper()[:15]:
                my_book = mb
                break
        
        # SUPERIORI: Verifica se il volume unico serve ancora nella classe SUCCESSIVA
        # Se sì, NON è vendibile perché lo studente lo userà ancora
        if child_tipo == "secondo_grado" and is_volume_unico_prec and classe_successiva:
            # Cerca se lo stesso libro è usato nella classe successiva
            libro_in_succ = False
            for libro_succ in all_libri_succ if classe_successiva else []:
                if libro_succ.get('disciplina', '').upper()[:15] == disc_prec.upper()[:15]:
                    if libro_succ.get('is_volume_unico', False):
                        # Verifica se è LO STESSO libro
                        titolo_prec = book_prec.get("titolo", "").upper()[:25]
                        titolo_succ = libro_succ.get("titolo", "").upper()[:25]
                        editore_prec = book_prec.get("editore", "").upper()[:15]
                        editore_succ = libro_succ.get("editore", "").upper()[:15]
                        if titolo_prec[:15] == titolo_succ[:15] and editore_prec == editore_succ:
                            libro_in_succ = True
                            break
            
            if libro_in_succ:
                # Il volume unico serve ancora l'anno prossimo - NON VENDIBILE
                non_vendibili.append({
                    "disciplina": disc_prec,
                    "isbn": book_prec.get("isbn", ""),
                    "titolo_vecchio": book_prec["titolo"][:40],
                    "titolo_nuovo": "",
                    "status": "SERVE ANCORA",
                    "motivo": f"Volume unico che serve anche in {classe_successiva}ª"
                })
                continue  # Passa al prossimo libro
        
        if my_book:
            if same_series(book_prec, my_book):
                # Il libro della classe precedente è vendibile alla classe successiva
                vendibili.append({
                    "isbn": book_prec.get("isbn", ""),
                    "disciplina": disc_prec,
                    "titolo": book_prec["titolo"][:50],  # Titolo del libro della classe PRECEDENTE
                    "editore": book_prec["editore"],
                    "prezzo_consigliato": round(book_prec["prezzo"] * 0.5, 2),
                    "status": "VENDIBILE"
                })
            else:
                # Edizione cambiata - il libro della classe precedente non è più compatibile
                non_vendibili.append({
                    "disciplina": disc_prec,
                    "isbn": book_prec.get("isbn", ""),
                    "titolo_vecchio": book_prec["titolo"][:40],  # Libro che avevi (classe precedente)
                    "titolo_nuovo": my_book["titolo"][:40],  # Libro nuovo adottato (classe attuale)
                    "status": "EDIZIONE CAMBIATA"
                })
        else:
            # La materia non esiste nella classe attuale - il libro potrebbe essere vendibile
            # se altri studenti della stessa classe (entranti) lo useranno
            # Per superiori: verifica se il libro è ancora adottato per la classe precedente
            if child_tipo == "secondo_grado" and is_volume_unico_prec:
                # Volume unico che non serve più in questa classe - VENDIBILE
                vendibili.append({
                    "isbn": book_prec.get("isbn", ""),
                    "disciplina": disc_prec,
                    "titolo": book_prec["titolo"][:50],
                    "editore": book_prec["editore"],
                    "prezzo_consigliato": round(book_prec["prezzo"] * 0.5, 2),
                    "status": "VENDIBILE",
                    "motivo": "Materia terminata - vendibile a studenti entranti"
                })
    
    # Calcola comprare - con conteggio copie disponibili
    comprare_usato = []
    comprare_nuovo = []  # Questi sono libri che al momento non hanno copie usate disponibili
    
    # LOGICA SPECIALE PER PRIMA MEDIA/SUPERIORE:
    # In prima classe NON ci sono libri "usati" da comprare perché non c'è classe precedente
    # Tutti i libri devono essere comprati NUOVI (a meno che non ci siano copie in vendita)
    is_prima_classe = (child_classe == 1)
    
    for disc_key, my_book in my_books_disc.items():
        isbn = my_book.get("isbn", "")
        # Usa la disciplina originale per i risultati
        disc = my_book.get("disciplina_originale", disc_key.split("_")[0])
        
        copie_disponibili = 0
        if isbn:
            copie_disponibili = await db.listings.count_documents({
                "book_isbn": isbn,
                "status": "available"
            })
        
        # Verifica se è una nuova edizione 2025/2026
        titolo_upper = my_book["titolo"].upper()
        is_nuova_edizione = "2025" in titolo_upper or "2026" in titolo_upper or "NUOVA EDIZIONE" in titolo_upper
        
        if is_prima_classe:
            # PRIMA CLASSE: verifica se il libro è potenzialmente disponibile usato
            # Per libri UNICI: deve essere LO STESSO libro adottato in 2ª e 3ª
            # Per libri ANNUALI: verifica se la stessa serie è adottata in classi superiori
            
            # Verifica se è una nuova edizione 2025/2026
            titolo_upper = my_book["titolo"].upper()
            is_nuova_edizione = "2025" in titolo_upper or "2026" in titolo_upper or "NUOVA EDIZIONE" in titolo_upper
            
            # Verifica se il libro ha nuova_adozione=True (dal DB)
            is_nuova_adozione = my_book.get("nuova_adozione", False)
            
            # Verifica se il libro è un volume unico
            is_volume_unico = my_book.get("is_volume_unico", False) or my_book.get("libri_multipli", [{}])[0].get("is_volume_unico", False)
            
            # Per i volumi UNICI, verifica se è LO STESSO libro in 2ª e 3ª
            potenzialmente_usato = False
            
            # Se è nuova adozione O nuova edizione, NON può essere comprato usato
            if is_nuova_edizione or is_nuova_adozione:
                potenzialmente_usato = False
            elif is_volume_unico:
                # Per volumi UNICI: verifica se è LO STESSO libro nelle classi del ciclo
                # Costruiamo un oggetto libro con i dati originali per il confronto
                libro_originale = my_book.get("libri_multipli", [my_book])[0]
                potenzialmente_usato = await is_same_book_in_higher_classes(
                    libro_originale, child_codice_scuola, disc, child_tipo, child_classe
                )
            else:
                # Per libri ANNUALI, verifica se la stessa serie è adottata in classi superiori
                if isbn or my_book.get("titolo"):
                    potenzialmente_usato = await is_potentially_available_used(
                        isbn, child_classe, child_tipo, 
                        titolo=my_book.get("titolo", ""), 
                        disciplina=disc,
                        codice_scuola=child_codice_scuola
                    )
            
            if copie_disponibili > 0:
                # Ci sono copie usate disponibili - va in "usato"
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE"
                })
            elif potenzialmente_usato:
                # Potenzialmente disponibile usato (adottato in classi superiori)
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": 0,
                    "status": "POTENZIALMENTE DISPONIBILE",
                    "motivo": "Libro adottato anche in classi superiori - potrebbe essere disponibile usato"
                })
            else:
                # Nessuna copia usata e non potenzialmente disponibile - deve comprare nuovo
                # Determina il motivo corretto
                if is_nuova_adozione:
                    motivo = "Nuova adozione - libro non disponibile usato"
                elif is_nuova_edizione:
                    motivo = "Nuova edizione 2025/2026 - da comprare nuovo"
                elif is_volume_unico:
                    motivo = "Volume unico con edizione diversa in 2ª o 3ª - da comprare nuovo"
                else:
                    motivo = "Prima classe - libro non adottato in classi superiori"
                
                comprare_nuovo.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"],
                    "editore": my_book["editore"],
                    "prezzo": my_book["prezzo"],
                    "copie_usate_disponibili": 0,
                    "is_nuova_edizione": is_nuova_edizione,
                    "is_nuova_adozione": is_nuova_adozione,
                    "motivo": motivo
                })
        elif disc in succ_books_disc:
            book_succ = succ_books_disc[disc]
            if same_series(my_book, book_succ):
                # Conta le copie disponibili per questo ISBN
                isbn = my_book.get("isbn", "")
                copie_disponibili = 0
                if isbn:
                    copie_disponibili = await db.listings.count_documents({
                        "book_isbn": isbn,
                        "status": "available"
                    })
                
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE" if copie_disponibili > 0 else "IN ATTESA"
                })
            else:
                # Edizione diversa - verifica se qualcuno vende comunque questo libro
                # O SE È POTENZIALMENTE DISPONIBILE USATO IN ALTRE SCUOLE
                isbn = my_book.get("isbn", "")
                copie_disponibili = 0
                if isbn:
                    copie_disponibili = await db.listings.count_documents({
                        "book_isbn": isbn,
                        "status": "available"
                    })
                
                # Verifica se è una nuova edizione 2025/2026
                titolo_upper = my_book["titolo"].upper()
                is_nuova_edizione = "2025" in titolo_upper or "2026" in titolo_upper or "NUOVA EDIZIONE" in titolo_upper
                
                # NUOVA LOGICA: Verifica se il libro è potenzialmente disponibile usato
                # (adottato in classi superiori in altre scuole dello stesso tipo)
                potenzialmente_usato = False
                if not is_nuova_edizione and (isbn or my_book.get("titolo")):
                    potenzialmente_usato = await is_potentially_available_used(
                        isbn, child_classe, child_tipo,
                        titolo=my_book.get("titolo", ""),
                        disciplina=disc,
                        codice_scuola=child_codice_scuola
                    )
                
                if potenzialmente_usato:
                    # Va nella sezione USATO anche se edizione diversa dalla classe successiva
                    comprare_usato.append({
                        "isbn": isbn,
                        "disciplina": disc,
                        "titolo": my_book["titolo"][:50],
                        "editore": my_book["editore"],
                        "prezzo_nuovo": my_book["prezzo"],
                        "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                        "risparmio": round(my_book["prezzo"] * 0.5, 2),
                        "copie_disponibili": copie_disponibili,
                        "status": "USATO DISPONIBILE" if copie_disponibili > 0 else "POTENZIALMENTE DISPONIBILE",
                        "motivo": "Libro adottato in altre classi/scuole - potrebbe essere disponibile usato"
                    })
                else:
                    comprare_nuovo.append({
                        "isbn": isbn,
                        "disciplina": disc,
                        "titolo": my_book["titolo"],  # Titolo completo
                        "editore": my_book["editore"],
                        "prezzo": my_book["prezzo"],
                        "copie_usate_disponibili": copie_disponibili,
                        "is_nuova_edizione": is_nuova_edizione,
                        "motivo": "Nuova edizione 2025 - da comprare nuovo" if is_nuova_edizione else f"Edizione diversa dalla {classe_successiva}ª"
                    })
        else:
            # Materia non presente nella classe successiva o fine ciclo
            isbn = my_book.get("isbn", "")
            copie_disponibili = 0
            if isbn:
                copie_disponibili = await db.listings.count_documents({
                    "book_isbn": isbn,
                    "status": "available"
                })
            
            # Verifica se è una nuova edizione 2025/2026
            titolo_upper = my_book["titolo"].upper()
            is_nuova_edizione = "2025" in titolo_upper or "2026" in titolo_upper or "NUOVA EDIZIONE" in titolo_upper
            
            # NUOVA LOGICA: Verifica se il libro è potenzialmente disponibile usato
            potenzialmente_usato = False
            if not is_nuova_edizione and (isbn or my_book.get("titolo")):
                potenzialmente_usato = await is_potentially_available_used(
                    isbn, child_classe, child_tipo,
                    titolo=my_book.get("titolo", ""),
                    disciplina=disc
                )
            
            if potenzialmente_usato:
                # Va nella sezione USATO
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE" if copie_disponibili > 0 else "POTENZIALMENTE DISPONIBILE",
                    "motivo": "Libro adottato in altre classi/scuole - potrebbe essere disponibile usato"
                })
            else:
                comprare_nuovo.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"],  # Titolo completo
                    "editore": my_book["editore"],
                    "prezzo": my_book["prezzo"],
                    "copie_usate_disponibili": copie_disponibili,
                    "is_nuova_edizione": is_nuova_edizione,
                    "motivo": "Nuova edizione 2025 - da comprare nuovo" if is_nuova_edizione else (f"Materia non in {classe_successiva}ª" if classe_successiva else "Fine ciclo - materia da usare quest'anno")
                })
    
    # Calcoli finali
    num_vendibili = len(vendibili)
    num_non_vendibili = len(non_vendibili)
    num_usato = len(comprare_usato)
    num_nuovo = len(comprare_nuovo)
    risparmio = sum(l["risparmio"] for l in comprare_usato)
    costo_nuovi = sum(l["prezzo"] for l in comprare_nuovo)
    
    # ========================================
    # LIBRI CONSIGLIATI / DA NON ACQUISTARE
    # ========================================
    # Questi libri sono marcati come "da_acquistare=False" o "consigliato=True"
    # ma in pratica spesso servono. Li mostriamo separatamente.
    
    libri_consigliati = []
    libri_consigliati_vendibili = []  # Dalla classe precedente
    
    # Libri consigliati della MIA classe (potrei doverli comprare)
    for libro in my_books_consigliati:
        isbn = libro.get("isbn", "")
        copie_disponibili = 0
        if isbn:
            copie_disponibili = await db.listings.count_documents({
                "book_isbn": isbn,
                "status": "available"
            })
        
        libri_consigliati.append({
            "isbn": isbn,
            "disciplina": libro.get("disciplina", ""),
            "titolo": libro.get("titolo", ""),
            "editore": libro.get("editore", ""),
            "prezzo": libro.get("prezzo_copertina", libro.get("prezzo", 0)),
            "copie_usate_disponibili": copie_disponibili,
            "tipo": "consigliato" if libro.get("consigliato") else "da_non_acquistare"
        })
    
    # Libri consigliati della classe PRECEDENTE (potrei venderli)
    for libro in libri_prec_consigliati:
        libri_consigliati_vendibili.append({
            "isbn": libro.get("isbn", ""),
            "disciplina": libro.get("disciplina", ""),
            "titolo": libro.get("titolo", "")[:50],
            "editore": libro.get("editore", ""),
            "prezzo_consigliato": round(libro.get("prezzo_copertina", libro.get("prezzo", 0)) * 0.5, 2),
            "tipo": "consigliato" if libro.get("consigliato") else "da_non_acquistare"
        })
    
    # Aggiungi volumi unici alla lista dei libri da comprare
    # Questi sono sempre "nuovi" a meno che qualcuno non li venda con "Vendi altro libro"
    # Usa set per evitare duplicati basati su ISBN o disciplina
    isbn_gia_aggiunti = set(l.get("isbn", "") for l in comprare_nuovo if l.get("isbn"))
    discipline_vu_aggiunte = set()
    
    for vu in volumi_unici_da_comprare:
        isbn = vu.get("isbn", "")
        disciplina = vu.get("disciplina", "").strip().upper()
        
        # Salta se ISBN già presente
        if isbn and isbn in isbn_gia_aggiunti:
            continue
        # Salta se disciplina già aggiunta (per volumi unici senza ISBN)
        if disciplina and disciplina in discipline_vu_aggiunte:
            continue
            
        isbn_gia_aggiunti.add(isbn)
        discipline_vu_aggiunte.add(disciplina)
        
        comprare_nuovo.append({
            "disciplina": disciplina,
            "titolo": vu["titolo"][:50],
            "prezzo": vu["prezzo"],
            "motivo": f"Volume unico ({min(vu['anni_coperti'])}-{max(vu['anni_coperti'])})",
            "isbn": isbn,
            "is_volume_unico": True
        })
    
    # Ricalcola totali con volumi unici
    num_nuovo = len(comprare_nuovo)
    costo_nuovi = sum(l["prezzo"] for l in comprare_nuovo)
    
    # ========================================
    # TETTI DI SPESA (Art. 15, comma 3 D.L. 112/2008)
    # ========================================
    # Tetti di spesa per libri di testo - Anno scolastico 2024/2025 e 2025/2026
    # Fonte: DM 58/2025 - Solo testi OBBLIGATORI (non consigliati)
    # Per libri misti (cartacei+digitali): -10%; solo digitali: -20%
    
    TETTI_SPESA = {
        "primo_grado": {  # Scuola Media (Secondaria I grado)
            1: 299.00,
            2: 119.00,
            3: 134.00
        },
        "secondo_grado": {  # Superiori (Secondaria II grado)
            # Liceo Scientifico (ordinario, scienze applicate, sportivo)
            "liceo_scientifico": {1: 320.00, 2: 223.00, 3: 320.00, 4: 288.00, 5: 310.00},
            # Liceo Classico
            "liceo_classico": {1: 335.00, 2: 245.00, 3: 338.00, 4: 280.00, 5: 305.00},
            # Liceo Linguistico
            "liceo_linguistico": {1: 330.00, 2: 235.00, 3: 330.00, 4: 280.00, 5: 300.00},
            # Liceo delle Scienze Umane
            "liceo_scienze_umane": {1: 310.00, 2: 220.00, 3: 310.00, 4: 270.00, 5: 290.00},
            # Liceo Artistico
            "liceo_artistico": {1: 295.00, 2: 210.00, 3: 295.00, 4: 260.00, 5: 280.00},
            # Liceo Musicale e Coreutico
            "liceo_musicale": {1: 285.00, 2: 200.00, 3: 285.00, 4: 250.00, 5: 270.00},
            # Istituto Tecnico Economico (ex Ragioneria)
            "istituto_tecnico_economico": {1: 310.00, 2: 220.00, 3: 310.00, 4: 265.00, 5: 285.00},
            # Istituto Tecnico Tecnologico (Industriale, Informatico, Meccanico, Elettronico)
            "istituto_tecnico_tecnologico": {1: 320.00, 2: 223.00, 3: 310.00, 4: 253.00, 5: 275.00},
            # Istituto Tecnico Agrario
            "istituto_tecnico_agrario": {1: 315.00, 2: 220.00, 3: 305.00, 4: 260.00, 5: 280.00},
            # Istituto Professionale (generico)
            "istituto_professionale": {1: 295.00, 2: 195.00, 3: 280.00, 4: 240.00, 5: 260.00},
            # Istituto Professionale Alberghiero (IPSSAR)
            "istituto_alberghiero": {1: 290.00, 2: 190.00, 3: 275.00, 4: 235.00, 5: 255.00},
            # Istituto Professionale per i Servizi Commerciali
            "istituto_servizi_commerciali": {1: 295.00, 2: 195.00, 3: 280.00, 4: 240.00, 5: 260.00},
            # Istituto Professionale per l'Industria e l'Artigianato (IPSIA)
            "ipsia": {1: 290.00, 2: 190.00, 3: 275.00, 4: 235.00, 5: 255.00},
            # Default (usa valori medi)
            "default": {1: 310.00, 2: 215.00, 3: 300.00, 4: 260.00, 5: 280.00}
        }
    }
    
    # Determina il tetto di spesa per questo profilo
    tetto_spesa = 0
    indirizzo_scuola = "default"
    nome_indirizzo_display = "Scuola Media" if child_tipo == "primo_grado" else ""
    
    if child_tipo == "primo_grado":
        tetto_spesa = TETTI_SPESA["primo_grado"].get(child_classe, 0)
        indirizzo_scuola = "scuola_media"
        nome_indirizzo_display = "Scuola Media"
    else:
        # Determina indirizzo scuola dal nome e codice
        nome_scuola_lower = (child_scuola or "").lower()
        codice_lower = (child_codice_scuola or "").lower()
        
        # Licei
        if "scientifico" in nome_scuola_lower or "fermi" in nome_scuola_lower or "siciliani" in nome_scuola_lower:
            indirizzo_scuola = "liceo_scientifico"
            nome_indirizzo_display = "Liceo Scientifico"
        elif "classico" in nome_scuola_lower or "galluppi" in nome_scuola_lower:
            indirizzo_scuola = "liceo_classico"
            nome_indirizzo_display = "Liceo Classico"
        elif "linguistico" in nome_scuola_lower:
            indirizzo_scuola = "liceo_linguistico"
            nome_indirizzo_display = "Liceo Linguistico"
        elif "scienze umane" in nome_scuola_lower or "pedagogico" in nome_scuola_lower:
            indirizzo_scuola = "liceo_scienze_umane"
            nome_indirizzo_display = "Liceo Scienze Umane"
        elif "artistico" in nome_scuola_lower:
            indirizzo_scuola = "liceo_artistico"
            nome_indirizzo_display = "Liceo Artistico"
        elif "musicale" in nome_scuola_lower or "coreutico" in nome_scuola_lower:
            indirizzo_scuola = "liceo_musicale"
            nome_indirizzo_display = "Liceo Musicale"
        # Istituti Tecnici
        elif "tecnico economico" in nome_scuola_lower or "ragioneria" in nome_scuola_lower or "itc" in nome_scuola_lower or "commerciale" in nome_scuola_lower:
            indirizzo_scuola = "istituto_tecnico_economico"
            nome_indirizzo_display = "Istituto Tecnico Economico"
        elif "agrario" in nome_scuola_lower or "agricoltura" in nome_scuola_lower:
            indirizzo_scuola = "istituto_tecnico_agrario"
            nome_indirizzo_display = "Istituto Tecnico Agrario"
        elif "tecnico" in nome_scuola_lower or "itis" in nome_scuola_lower or "industriale" in nome_scuola_lower or "informatico" in nome_scuola_lower or codice_lower.startswith("cztf") or codice_lower.startswith("cztl"):
            indirizzo_scuola = "istituto_tecnico_tecnologico"
            nome_indirizzo_display = "Istituto Tecnico Tecnologico"
        # Istituti Professionali
        elif "alberghiero" in nome_scuola_lower or "ipssar" in nome_scuola_lower or "enogastronomia" in nome_scuola_lower:
            indirizzo_scuola = "istituto_alberghiero"
            nome_indirizzo_display = "Istituto Alberghiero"
        elif "ipsia" in nome_scuola_lower or "artigianato" in nome_scuola_lower:
            indirizzo_scuola = "ipsia"
            nome_indirizzo_display = "IPSIA"
        elif "professionale" in nome_scuola_lower or codice_lower.startswith("czrc") or codice_lower.startswith("czrh"):
            indirizzo_scuola = "istituto_professionale"
            nome_indirizzo_display = "Istituto Professionale"
        else:
            indirizzo_scuola = "default"
            nome_indirizzo_display = "Scuola Superiore"
        
        tetto_spesa = TETTI_SPESA["secondo_grado"].get(indirizzo_scuola, TETTI_SPESA["secondo_grado"]["default"]).get(child_classe, 0)
    
    # Calcola totale libri obbligatori (esclusi consigliati)
    # Il tetto di spesa si applica SOLO ai libri obbligatori, non ai consigliati
    costo_obbligatori_nuovi = sum(l["prezzo"] for l in comprare_nuovo)
    costo_obbligatori_usati = sum(l["prezzo_nuovo"] for l in comprare_usato)
    costo_totale_obbligatori = costo_obbligatori_nuovi + costo_obbligatori_usati
    
    # Calcola anche il costo totale REALE (inclusi consigliati)
    costo_consigliati = sum(l.get("prezzo", 0) for l in libri_consigliati)
    costo_totale_tutti = costo_totale_obbligatori + costo_consigliati
    
    # Confronto con tetto di spesa
    tetto_info = {
        "tetto_ministeriale": round(tetto_spesa, 2),
        "tetto_con_deroga_10": round(tetto_spesa * 1.10, 2),  # +10% deroga consentita
        "tetto_con_deroga_15": round(tetto_spesa * 1.15, 2),  # +15% deroga massima
        "costo_obbligatori": round(costo_totale_obbligatori, 2),
        "costo_consigliati": round(costo_consigliati, 2),
        "costo_totale_tutti": round(costo_totale_tutti, 2),  # Obbligatori + Consigliati
        "differenza": round(costo_totale_obbligatori - tetto_spesa, 2),
        "percentuale_sforamento": round((costo_totale_obbligatori / tetto_spesa * 100) - 100, 1) if tetto_spesa > 0 else 0,
        "entro_limite": costo_totale_obbligatori <= tetto_spesa,
        "entro_deroga_10": costo_totale_obbligatori <= (tetto_spesa * 1.10),
        "entro_deroga_15": costo_totale_obbligatori <= (tetto_spesa * 1.15),
        "riferimento_normativo": "Art. 15, comma 3 D.L. 112/2008 (conv. L. 133/2008)",
        "indirizzo_scuola": indirizzo_scuola,
        "nome_indirizzo": nome_indirizzo_display
    }
    
    return {
        "child_id": child_id,
        "child_name": child_nome,
        "child_classe": child_classe,
        "child_scuola": child_scuola,
        "codice_scuola": child_codice_scuola,
        "tipo_scuola": child_tipo,
        "ciclo": cycle_name,
        
        "vendere": {
            "classe_destinazione": classe_precedente,
            "totale_vendibili": num_vendibili,
            "totale_non_vendibili": num_non_vendibili,
            "libri_vendibili": vendibili,
            "libri_non_vendibili": non_vendibili
        },
        
        "comprare": {
            "classe_origine": classe_successiva,
            "totale_usati": num_usato,
            "risparmio_totale": round(risparmio, 2),
            "libri_usati": comprare_usato
        },
        
        "nuovi": {
            "totale": num_nuovo,
            "costo_totale": round(costo_nuovi, 2),
            "libri": comprare_nuovo
        },
        
        # NUOVA SEZIONE: Libri consigliati o da non acquistare
        "consigliati": {
            "totale_da_comprare": len(libri_consigliati),
            "totale_da_vendere": len(libri_consigliati_vendibili),
            "costo_totale": round(sum(l.get("prezzo", 0) for l in libri_consigliati), 2),
            "libri_da_comprare": libri_consigliati,
            "libri_da_vendere": libri_consigliati_vendibili,
            "nota": "Questi libri sono indicati come 'consigliati' o 'da non acquistare' dal MIUR, ma in pratica spesso servono."
        },
        
        # NUOVA SEZIONE: Tetto di spesa ministeriale
        "tetto_spesa": tetto_info,
        
        # NUOVA SEZIONE: Transazioni reali per questo profilo figlio SPECIFICO
        # Acquisti: libri acquistati DAL GENITORE PER questo figlio
        "libri_acquistati_reali": await db.orders.count_documents({
            "buyer_id": user_id,
            "child_profile_id": child_id,
            "status": {"$in": ["completed", "picked_up", "paid_escrow", "ready_for_pickup"]}
        }),
        # Vendite: libri venduti DA questo figlio (il listing appartiene a questo profilo)
        "libri_venduti_reali": await db.orders.count_documents({
            "seller_id": user_id,
            "seller_child_profile_id": child_id,
            "status": {"$in": ["completed", "picked_up", "paid_escrow", "ready_for_pickup"]}
        }),
        # Spesa reale: totale speso per acquisti PER questo figlio
        "spesa_reale": sum([
            o.get("totale_acquirente", 0) 
            async for o in db.orders.find({
                "buyer_id": user_id,
                "child_profile_id": child_id,
                "status": {"$in": ["completed", "picked_up", "paid_escrow", "ready_for_pickup"]}
            })
        ]),
        # Guadagno reale: totale guadagnato dalle vendite DI questo figlio
        "guadagno_reale": sum([
            o.get("netto_venditore", 0) 
            async for o in db.orders.find({
                "seller_id": user_id,
                "seller_child_profile_id": child_id,
                "status": {"$in": ["completed", "picked_up"]}
            })
        ]),
        
        "summary": {
            "totale_miei_libri": len(my_books_disc),
            "vendibili": num_vendibili,
            "non_vendibili": num_non_vendibili,
            "usati": num_usato,
            "nuovi": num_nuovo,
            "consigliati": len(libri_consigliati),
            "risparmio_stimato": round(risparmio, 2),
            "costo_nuovi": round(costo_nuovi, 2),
            "costo_consigliati": round(sum(l.get("prezzo", 0) for l in libri_consigliati), 2),
            "ciclo_info": f"{'Scuola Media' if child_tipo == 'primo_grado' else 'Superiore'} - {cycle_name.capitalize()}"
        }
    }


@api_router.get("/profiles/{user_id}/children/{child_id}/books-pdf")
async def generate_books_pdf(user_id: str, child_id: str):
    """
    Genera PDF formato ufficiale MUR - ELENCO DEI LIBRI DI TESTO ADOTTATI O CONSIGLIATI
    """
    from reportlab.lib.pagesizes import landscape
    
    # Get user and child profile
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    child_nome = child_profile.get("nome_figlio", "Figlio")
    child_scuola = child_profile.get("scuola", "")
    child_classe = int(child_profile.get("classe", 1))
    child_sezione = child_profile.get("sezione", "A")
    child_codice_scuola = child_profile.get("codice_scuola", "")
    child_tipo = child_profile.get("tipo_scuola", "primo_grado")
    
    if not child_codice_scuola:
        raise HTTPException(status_code=400, detail="Codice scuola non configurato")
    
    # Get books from NEW adozioni collection (per sezione)
    adozione = await db.adozioni.find_one({
        "codice_scuola": child_codice_scuola,
        "classe": child_classe,
        "sezione": child_sezione.upper()
    })
    
    books = adozione.get('libri', []) if adozione else []
    
    # Fallback to old books collection if no adozione found
    if not books:
        old_books = await db.books.find({
            "scuole_adottanti": child_codice_scuola,
            "anni_corso": child_classe
        }).to_list(200)
        books = old_books
    
    # Create PDF - LANDSCAPE A4
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=landscape(A4), 
        topMargin=0.8*cm, 
        bottomMargin=0.8*cm,
        leftMargin=1*cm, 
        rightMargin=1*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Styles
    header_style = ParagraphStyle('Header', fontSize=9, leading=11)
    cell_style = ParagraphStyle('Cell', fontSize=7, leading=9, wordWrap='CJK')
    cell_bold = ParagraphStyle('CellBold', fontSize=7, leading=9, fontName='Helvetica-Bold', wordWrap='CJK')
    
    # Header
    scuola_nome = child_scuola.split('-')[0].strip() if '-' in child_scuola else child_scuola
    tipo_scuola_label = "SCUOLA SECONDARIA DI I GRADO" if child_tipo == "primo_grado" else "SCUOLA SECONDARIA DI II GRADO"
    classe_label = f"{child_classe} {child_sezione}"
    
    header_data = [[
        Paragraph(f"<b>{scuola_nome.upper()}</b><br/><font size='8'>{child_codice_scuola}</font><br/>88100 Catanzaro", header_style),
        Paragraph("<b><font size='20'>RiLiBro</font></b>", ParagraphStyle('Code', fontSize=11, fontName='Helvetica-Bold', alignment=TA_CENTER)),
        Paragraph(f"<b>ELENCO DEI LIBRI DI TESTO<br/>ADOTTATI O CONSIGLIATI</b><br/><br/>Tipo Scuola: {tipo_scuola_label}<br/>Classe: {classe_label}<br/>Anno Scolastico 2025-2026", 
                 ParagraphStyle('RightHeader', fontSize=9, leading=11, alignment=TA_LEFT))
    ]]
    
    header_table = Table(header_data, colWidths=[7*cm, 5*cm, 9*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ('BOX', (1, 0), (1, 0), 1, colors.black),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.5*cm))
    
    # Table header
    table_data = [[
        Paragraph('<b>Materia / Disciplina</b>', cell_bold),
        Paragraph('<b>Codice Volume</b>', cell_bold),
        Paragraph('<b>Autore</b>', cell_bold),
        Paragraph('<b>Titolo / Sottotitolo</b>', cell_bold),
        Paragraph('<b>Vol.</b>', cell_bold),
        Paragraph('<b>Editore</b>', cell_bold),
        Paragraph('<b>Prezzo</b>', cell_bold),
        Paragraph('<b>Nuova<br/>Adoz.</b>', cell_bold),
        Paragraph('<b>Da<br/>Acq.</b>', cell_bold),
        Paragraph('<b>Cons.</b>', cell_bold),
    ]]
    
    col_widths = [3.2*cm, 2.5*cm, 4*cm, 7*cm, 1*cm, 3*cm, 1.3*cm, 1.2*cm, 1.2*cm, 1.2*cm]
    
    # Totale libri da acquistare
    total_price = 0
    
    # Add books
    for book in sorted(books, key=lambda x: x.get('disciplina', '')):
        disciplina = book.get('disciplina', '')
        isbn = book.get('isbn', '') or '-'
        autori = book.get('autori', '') or '-'
        titolo = book.get('titolo', '')
        editore = book.get('editore', '') or '-'
        prezzo = book.get('prezzo_copertina') or book.get('prezzo_ministeriale') or 0
        
        anni = book.get('anni_corso', [])
        vol = "U" if book.get('is_volume_unico') else str(child_classe)
        nuova_adoz = "Si" if book.get('nuova_adozione') else "No"
        
        # Logica "Da Acquistare" - USA IL CAMPO DAL DATABASE (come nel PDF MIUR)
        # Il campo da_acquistare nel DB indica se il libro va acquistato quest'anno
        da_acq_db = book.get('da_acquistare')
        is_volume_unico = book.get('is_volume_unico', False)
        cons_db = book.get('consigliato')
        
        # Se il libro è CONSIGLIATO (Ap), il da_acquistare resta "No" perché non è obbligatorio
        # La regola della prima classe si applica SOLO ai libri NON consigliati
        if cons_db == True:
            # Libro consigliato: da_acquistare = No (non obbligatorio)
            da_acq = "No"
        elif child_classe == 1 and is_volume_unico:
            # REGOLA SPECIALE: Per la PRIMA classe (1° anno del ciclo), 
            # TUTTI i volumi unici NON consigliati devono essere acquistati
            da_acq = "Si"
        elif da_acq_db is not None:
            # Usa il valore dal database (fonte: MIUR)
            da_acq = "Si" if da_acq_db == True else "No"
        else:
            # Fallback per vecchi dati senza il campo
            if is_volume_unico:
                # MEDIE (primo_grado): volumi unici sono TRIENNALI (1-2-3)
                # Solo chi fa la 1ª deve comprarli
                if child_tipo == "primo_grado":
                    da_acq = "Si" if child_classe == 1 else "No"
                else:
                    # SUPERIORI: dipende dal ciclo (biennio 1-2, triennio 3-4-5)
                    if child_classe <= 2:
                        # Biennio: comprare solo in 1ª
                        da_acq = "Si" if child_classe == 1 else "No"
                    else:
                        # Triennio: comprare solo in 3ª
                        da_acq = "Si" if child_classe == 3 else "No"
            else:
                # Libro annuale: sempre da acquistare
                da_acq = "Si"
        
        # Logica "Consigliato" - USA IL CAMPO DAL DATABASE (come nel PDF MIUR)
        cons_db = book.get('consigliato')
        if cons_db == True:
            consigliato = "Ap"
        else:
            consigliato = "No"
        
        table_data.append([
            Paragraph(disciplina, cell_style),
            Paragraph(isbn, cell_style),
            Paragraph(autori, cell_style),
            Paragraph(titolo, cell_style),
            Paragraph(vol, cell_style),
            Paragraph(editore, cell_style),
            Paragraph(f"€ {prezzo:.2f}" if prezzo else "-", cell_style),
            Paragraph(nuova_adoz, cell_style),
            Paragraph(da_acq, cell_style),
            Paragraph(consigliato, cell_style),
        ])
        
        # Somma al totale se da acquistare
        if da_acq == "Si" and prezzo:
            total_price += prezzo
    
    # Aggiungi riga TOTALE
    table_data.append([
        Paragraph('', cell_style),
        Paragraph('', cell_style),
        Paragraph('', cell_style),
        Paragraph('', cell_style),
        Paragraph('', cell_style),
        Paragraph('<b>TOTALE:</b>', cell_bold),
        Paragraph(f'<b>€ {total_price:.2f}</b>', cell_bold),
        Paragraph('', cell_style),
        Paragraph('', cell_style),
        Paragraph('', cell_style),
    ])
    
    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (4, 1), (4, -1), 'CENTER'),
        ('ALIGN', (6, 1), (6, -1), 'RIGHT'),
        ('ALIGN', (7, 1), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
    ]))
    elements.append(table)
    
    # Footer
    elements.append(Spacer(1, 0.3*cm))
    footer_style = ParagraphStyle('Footer', fontSize=8)
    elements.append(Paragraph(f"Data aggiornamento: {datetime.now().strftime('%Y')}                                                                    Generato da RiLiBro", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"lista_libri_{child_nome}_{child_classe}{child_sezione}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})



@api_router.get("/profiles/{user_id}/children/{child_id}/books-to-sell")
async def get_books_to_sell(user_id: str, child_id: str):
    """
    Restituisce la lista dei libri che il figlio può VENDERE.
    
    NUOVA LOGICA (allineata al Radar):
    Mostra SOLO i libri che hanno una domanda reale (cioè quelli che gli studenti
    della classe inferiore vogliono comprare perché la serie/edizione è compatibile).
    
    1. Prende i libri della classe PRECEDENTE (che lo studente ha usato)
    2. Confronta con i libri della classe ATTUALE (che i compratori useranno)
    3. Se stessa serie/edizione → VENDIBILE (c'è domanda)
    4. Se edizione diversa → NON vendibile (non c'è domanda nel flusso naturale)
    
    I libri non mostrati qui possono comunque essere venduti via "Vendi altro libro".
    """
    import re
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    child_classe = int(child_profile.get("classe", 1))
    child_tipo = child_profile.get("tipo_scuola", "primo_grado")
    child_codice_scuola = child_profile.get("codice_scuola", "")
    
    if not child_codice_scuola:
        return {"books": [], "error": "Codice scuola non configurato"}
    
    # Helper functions (same as Radar)
    def get_series_name(title: str) -> str:
        title = title.upper().strip()
        title = re.sub(r'\s*V\.?\s*\d+', '', title, flags=re.IGNORECASE)
        if '+' in title:
            title = title.split('+')[0]
        title = re.sub(r'\s*\(LDM.*?\)', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*-?\s*(VOLUME|VOL\.?)\s*\d+.*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*-\s*\d+.*', '', title)
        title = re.sub(r'\s+(LE\s+SCIENZE)\s+\d+', r' \1', title)
        title = re.sub(r'\s+\d+\s*$', '', title)
        words = title.split()
        if len(words) > 1:
            anno_specific = {'ARITMETICA', 'ALGEBRA', 'GEOMETRIA', 'ANTOLOGIA', 'LETTERATURA'}
            words = [w for w in words if w not in anno_specific]
        title = ' '.join(words).strip()
        title = re.sub(r'\s*-\s*$', '', title).strip()
        return title
    
    def has_edition_marker(title: str) -> str:
        title = title.upper()
        match = re.search(r'(\d+ED\.?|EDIZIONE\s+\w+|ED\.\s*\w+)', title)
        return match.group(1) if match else ""
    
    def same_series(book1: dict, book2: dict) -> bool:
        if book1.get("editore", "").upper() != book2.get("editore", "").upper():
            return False
        t1 = book1.get("titolo", "").upper()
        t2 = book2.get("titolo", "").upper()
        ed1 = has_edition_marker(t1)
        ed2 = has_edition_marker(t2)
        if ed1 != ed2:
            return False
        series1 = get_series_name(t1)
        series2 = get_series_name(t2)
        if series1 == series2:
            return True
        words1 = set(series1.split())
        words2 = set(series2.split())
        words1.discard('-')
        words2.discard('-')
        if not words1 or not words2:
            return False
        common = words1.intersection(words2)
        min_words = min(len(words1), len(words2))
        similarity = len(common) / max(len(words1), len(words2))
        return similarity >= 0.7 and len(common) >= min(2, min_words)
    
    # Calcola classe precedente (quella dei compratori potenziali)
    # I compratori sono nella classe che TU hai fatto l'anno scorso
    isMedia = child_tipo == "primo_grado"
    
    # Per medie: ciclo unico 1-2-3
    # Per superiori: biennio (1-2) e triennio (3-4-5)
    if isMedia:
        # Medie: ciclo unico
        classe_compratori = child_classe - 1 if child_classe > 1 else None
    else:
        # Superiori: biennio e triennio separati
        if child_classe == 1:
            classe_compratori = None  # Primo anno, niente da vendere
        elif child_classe == 3:
            # Terzo anno: vendi alla 2ª? No, il biennio è finito, non c'è domanda dal triennio
            # I libri del 2° anno non servono al 3° anno (cambio ciclo)
            # Puoi vendere solo tramite "Vendi altro libro"
            classe_compratori = None
        else:
            classe_compratori = child_classe - 1
    
    if not classe_compratori:
        # Messaggio specifico per i casi speciali
        if child_classe == 1:
            return {"books": [], "message": "Primo anno - niente da vendere", "classe_destinazione": None}
        elif child_classe == 3 and not isMedia:
            return {"books": [], "message": "Inizio triennio - i libri del biennio non sono compatibili. Usa 'Vendi altro libro' per inserirli manualmente.", "classe_destinazione": 2}
        else:
            return {"books": [], "message": "Nessun libro vendibile nel flusso naturale", "classe_destinazione": None}
    
    # === LOGICA ALLINEATA AL RADAR ===
    # USA LA STESSA LOGICA DEL COMPATIBILITY ENDPOINT (collezione adozioni)
    
    async def get_books_from_adozioni(codice_scuola: str, classe: int, sezione: str) -> list:
        """Recupera libri dalla collezione adozioni per una specifica combinazione.
        Se la sezione non esiste, usa la prima sezione disponibile (fallback)."""
        # Prima prova con la sezione esatta
        adozione = await db.adozioni.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe,
            "sezione": sezione.upper()
        })
        if adozione:
            return adozione.get('libri', [])
        
        # FALLBACK: Se la sezione non esiste, usa qualsiasi sezione disponibile per quella classe
        adozione_fallback = await db.adozioni.find_one({
            "codice_scuola": codice_scuola,
            "classe": classe
        })
        if adozione_fallback:
            return adozione_fallback.get('libri', [])
        
        return []
    
    # Carica libri della classe PRECEDENTE (quelli che LO STUDENTE HA USATO)
    child_sezione = child_profile.get("sezione", "A").upper()
    libri_precedente = await get_books_from_adozioni(child_codice_scuola, child_classe - 1, child_sezione)
    
    # Carica libri della classe ATTUALE (quelli che i COMPRATORI useranno)
    libri_compratori = await get_books_from_adozioni(child_codice_scuola, classe_compratori, child_sezione)
    
    # Organizza per disciplina (libri dei compratori) - SOLO libri obbligatori
    compratori_disc = {}
    for b in libri_compratori:
        # Filtra solo libri obbligatori (da_acquistare=True e non consigliato)
        if not b.get("da_acquistare", True) or b.get("consigliato", False):
            continue
            
        disc = b.get("disciplina", "").strip().upper()
        if disc and disc not in compratori_disc:
            compratori_disc[disc] = {
                "isbn": b.get("isbn", ""),
                "titolo": b.get("titolo", ""),
                "editore": b.get("editore", "").strip().upper(),
                "autori": b.get("autori", ""),
                "prezzo": b.get("prezzo_copertina", b.get("prezzo", 0)),
                "titolo_base": get_series_name(b.get("titolo", "")),
            }
    
    # Organizza i libri dello studente per disciplina - SOLO libri obbligatori
    miei_libri_disc = {}
    for b in libri_precedente:
        # Filtra solo libri obbligatori (da_acquistare=True e non consigliato)
        if not b.get("da_acquistare", True) or b.get("consigliato", False):
            continue
            
        disc = b.get("disciplina", "").strip().upper()
        if disc and disc not in miei_libri_disc:
            miei_libri_disc[disc] = {
                "isbn": b.get("isbn", ""),
                "titolo": b.get("titolo", ""),
                "editore": b.get("editore", "").strip().upper(),
                "autori": b.get("autori", ""),
                "prezzo": b.get("prezzo_copertina", b.get("prezzo", 0)),
                "disciplina": disc,
            }
    
    # Trova i libri VENDIBILI usando la STESSA LOGICA del compatibility endpoint
    # LOGICA CORRETTA: i libri VENDIBILI sono quelli della CLASSE PRECEDENTE (che lo studente ha già usato)
    # Confrontiamo con la classe attuale per verificare compatibilità serie/edizione
    vendibili = []
    
    # Carica anche i libri della classe ATTUALE (4ª per GESON) per il confronto
    libri_attuali = await get_books_from_adozioni(child_codice_scuola, child_classe, child_sezione)
    
    # Organizza libri attuali per disciplina - SOLO libri obbligatori
    attuali_disc = {}
    for b in libri_attuali:
        # Filtra solo libri obbligatori (da_acquistare=True e non consigliato)
        if not b.get("da_acquistare", True) or b.get("consigliato", False):
            continue
            
        disc = b.get("disciplina", "").strip().upper()
        if disc and disc not in attuali_disc:
            attuali_disc[disc] = {
                "isbn": b.get("isbn", ""),
                "titolo": b.get("titolo", ""),
                "editore": b.get("editore", "").strip().upper(),
                "autori": b.get("autori", ""),
                "prezzo": b.get("prezzo_copertina", b.get("prezzo", 0)),
                "titolo_base": get_series_name(b.get("titolo", "")),
            }
    
    # STESSA LOGICA DEL COMPATIBILITY ENDPOINT:
    # Itera sui libri della classe PRECEDENTE e confronta con classe ATTUALE
    for disc, book_prec in miei_libri_disc.items():  # Libri della classe precedente (3ª)
        if disc in attuali_disc:  # Se c'è un libro corrispondente nella classe attuale (4ª)
            book_attuale = attuali_disc[disc]
            if same_series(book_prec, book_attuale):
                # Il libro della classe precedente è vendibile - stessa serie/edizione
                vendibili.append({
                    "id": book_prec.get("isbn", ""),
                    "isbn": book_prec.get("isbn", ""),
                    "titolo": book_prec.get("titolo", ""),
                    "autori": book_prec.get("autori", ""),
                    "disciplina": disc,
                    "editore": book_prec.get("editore", ""),
                    "prezzo_copertina": book_prec.get("prezzo", 0),
                    "prezzo_suggerito": round(book_prec.get("prezzo", 0) * 0.5, 2),
                    "classe_destinazione": classe_compratori,
                    "tipo": "vendibile",
                    "status": "VENDIBILE"
                })
            # Se non sono della stessa serie, il libro NON è vendibile (edizione cambiata)
            # Non lo includiamo nella lista - l'utente può usare "Vendi altro libro"
    
    # Rimuovi duplicati per ISBN (just in case)
    seen_isbn = set()
    unique_vendibili = []
    for v in vendibili:
        if v["isbn"] and v["isbn"] not in seen_isbn:
            seen_isbn.add(v["isbn"])
            unique_vendibili.append(v)
    
    return {
        "books": unique_vendibili,
        "classe_attuale": child_classe,
        "classe_destinazione": classe_compratori,
        "totale": len(unique_vendibili),
        "message": f"Libri vendibili alla {classe_compratori}ª" if unique_vendibili else "Nessun libro vendibile. Usa 'Vendi altro libro' per inserire manualmente."
    }


@api_router.get("/profiles/{user_id}/children/{child_id}/books-to-buy")
async def get_books_to_buy(user_id: str, child_id: str):
    """
    Restituisce la lista dei libri che il figlio può COMPRARE USATI (con logica compatibilità).
    """
    import re
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    child_classe = int(child_profile.get("classe", 1))
    child_tipo = child_profile.get("tipo_scuola", "primo_grado")
    child_codice_scuola = child_profile.get("codice_scuola", "")
    
    if not child_codice_scuola:
        return {"books": [], "error": "Codice scuola non configurato"}
    
    # Helper functions (stesse di sopra)
    def get_series_name(title: str) -> str:
        title = title.upper().strip()
        title = re.sub(r'\s*V\.?\s*\d+', '', title, flags=re.IGNORECASE)
        if '+' in title:
            title = title.split('+')[0]
        title = re.sub(r'\s*\(LDM.*?\)', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*-?\s*(VOLUME|VOL\.?)\s*\d+.*', '', title, flags=re.IGNORECASE)
        title = re.sub(r'\s*-\s*\d+.*', '', title)
        title = re.sub(r'\s+(LE\s+SCIENZE)\s+\d+', r' \1', title)
        title = re.sub(r'\s+\d+\s*$', '', title)
        words = title.split()
        if len(words) > 1:
            anno_specific = {'ARITMETICA', 'ALGEBRA', 'GEOMETRIA', 'ANTOLOGIA', 'LETTERATURA'}
            words = [w for w in words if w not in anno_specific]
        title = ' '.join(words).strip()
        title = re.sub(r'\s*-\s*$', '', title).strip()
        return title
    
    def has_edition_marker(title: str) -> str:
        title = title.upper()
        match = re.search(r'(\d+ED\.?|EDIZIONE\s+\w+|ED\.\s*\w+)', title)
        return match.group(1) if match else ""
    
    def same_series(book1: dict, book2: dict) -> bool:
        if book1.get("editore", "").upper() != book2.get("editore", "").upper():
            return False
        t1 = book1.get("titolo", "").upper()
        t2 = book2.get("titolo", "").upper()
        ed1 = has_edition_marker(t1)
        ed2 = has_edition_marker(t2)
        if ed1 != ed2:
            return False
        series1 = get_series_name(t1)
        series2 = get_series_name(t2)
        if series1 == series2:
            return True
        words1 = set(series1.split())
        words2 = set(series2.split())
        words1.discard('-')
        words2.discard('-')
        if not words1 or not words2:
            return False
        common = words1.intersection(words2)
        min_words = min(len(words1), len(words2))
        similarity = len(common) / max(len(words1), len(words2))
        return similarity >= 0.7 and len(common) >= min(2, min_words)
    
    # Calcola classe successiva
    isMedia = child_tipo == "primo_grado"
    maxClasse = 3 if isMedia else (2 if child_classe <= 2 else 5)
    classe_successiva = child_classe + 1 if child_classe < maxClasse else None
    
    if not classe_successiva:
        return {"books": [], "message": "Ultimo anno del ciclo - niente da comprare usato"}
    
    # Carica libri della classe ATTUALE (che servono al figlio)
    my_books = await db.books.find({
        "scuole_adottanti": child_codice_scuola,
        "anni_corso": child_classe,
        "is_volume_unico": {"$ne": True}
    }).to_list(100)
    
    # Carica libri della classe SUCCESSIVA (per confronto serie)
    libri_succ = await db.books.find({
        "scuole_adottanti": child_codice_scuola,
        "anni_corso": classe_successiva,
        "is_volume_unico": {"$ne": True}
    }).to_list(100)
    
    # Organizza per disciplina
    my_books_disc = {}
    for b in my_books:
        disc = b.get("disciplina", "").strip().upper()
        if disc and disc not in my_books_disc:
            my_books_disc[disc] = b
    
    succ_books_disc = {}
    for b in libri_succ:
        disc = b.get("disciplina", "").strip().upper()
        if disc and disc not in succ_books_disc:
            succ_books_disc[disc] = b
    
    # Trova libri comprabilità usati (stessa serie)
    comprabilità = []
    for disc, my_book in my_books_disc.items():
        if disc in succ_books_disc:
            book_succ = succ_books_disc[disc]
            if same_series(my_book, book_succ):
                # Conta copie disponibili
                isbn = my_book.get("isbn", "")
                copie_count = await db.listings.count_documents({
                    "book_isbn": isbn,
                    "status": "available"
                }) if isbn else 0
                
                comprabilità.append({
                    "id": my_book.get("isbn", ""),
                    "isbn": my_book.get("isbn", ""),
                    "titolo": my_book.get("titolo", ""),
                    "autori": my_book.get("autori", ""),
                    "disciplina": disc,
                    "editore": my_book.get("editore", ""),
                    "prezzo_copertina": my_book.get("prezzo_copertina", 0),
                    "prezzo_usato": round(my_book.get("prezzo_copertina", 0) * 0.5, 2),
                    "risparmio": round(my_book.get("prezzo_copertina", 0) * 0.5, 2),
                    "classe_origine": classe_successiva,
                    "copie_disponibili": copie_count
                })
    
    return {
        "books": comprabilità,
        "classe_origine": classe_successiva,
        "totale": len(comprabilità)
    }


@api_router.get("/radar/{user_id}/sellers")
async def get_radar_sellers(user_id: str, filter_type: Optional[str] = None):
    """Get list of sellers with their books that match user's wanted books"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Get user's requests (use book_isbn)
    user_requests = await db.requests.find({"buyer_id": user_id, "stato": "cercando"}).to_list(50)
    wanted_isbns = [req.get("book_isbn", req.get("book_id", "")) for req in user_requests]
    wanted_isbns = [isbn for isbn in wanted_isbns if isbn]
    
    if not wanted_isbns:
        return []
    
    # Get user's school info from child profiles
    user_codice_scuola = None
    user_classe = None
    user_sezione = None
    profili = user.get("profili_figli", [])
    if profili:
        first_child = profili[0]
        user_codice_scuola = first_child.get("codice_scuola", "")
        user_classe = str(first_child.get("classe", ""))
        user_sezione = first_child.get("sezione", "")
    
    # Find all available listings for wanted books (use book_isbn and status: available)
    pipeline = [
        {
            "$match": {
                "book_isbn": {"$in": wanted_isbns},
                "seller_id": {"$ne": user_id},
                "status": "available"
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
        {"$unwind": {"path": "$seller_info", "preserveNullAndEmptyArrays": True}},
        {
            "$group": {
                "_id": "$seller_id",
                "seller_username": {"$first": "$seller_username"},
                "codice_scuola": {"$first": "$codice_scuola"},
                "classe": {"$first": "$classe"},
                "sezione": {"$first": "$sezione"},
                "scuola": {"$first": "$scuola"},
                "books_count": {"$sum": 1},
                "total_price": {"$sum": "$prezzo_vendita"},
                "books": {
                    "$push": {
                        "listing_id": "$id",
                        "book_id": "$book_isbn",
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
        seller_codice = seller.get("codice_scuola", "")
        seller_classe = str(seller.get("classe", ""))
        seller_sezione = seller.get("sezione", "")
        
        # Categorize by codice_scuola instead of scuola name
        is_same_school = seller_codice == user_codice_scuola
        is_same_class = seller_classe == user_classe and is_same_school
        is_same_section = seller_sezione == user_sezione and is_same_class
        
        if is_same_section:
            category = "stessa_sezione"
        elif is_same_class:
            category = "stessa_classe"
        elif is_same_school:
            category = "stessa_scuola"
        else:
            category = "altri"
        
        # Apply filter if provided
        if filter_type and filter_type != category:
            continue
            
        result.append({
            "seller_id": seller["_id"],
            "seller_username": seller["seller_username"],
            "scuola": seller.get("scuola", ""),
            "classe": seller_classe,
            "sezione": seller_sezione,
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


def generate_pickup_code():
    """Generate a unique 6-character pickup code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


# ==================== SISTEMA CARRELLO CON CONFERMA VENDITORE ====================

class CartItem(BaseModel):
    id: str = ""
    listing_id: str
    buyer_id: str
    seller_id: str
    book_isbn: str
    book_titolo: str
    book_editore: str = ""
    prezzo: float
    bookstore_id: str
    bookstore_nome: str
    status: str = "pending"  # pending, confirmed, rejected, expired
    created_at: str = ""
    expires_at: str = ""  # 24 ore dalla creazione
    seller_response_at: str = ""


@api_router.post("/cart/add")
async def add_to_cart(listing_id: str, bookstore_id: str, buyer_id: str):
    """Aggiunge un libro al carrello e notifica il venditore"""
    from datetime import timedelta
    
    # Get listing
    listing = await db.listings.find_one({"id": listing_id, "status": "available"})
    if not listing:
        raise HTTPException(status_code=404, detail="Libro non disponibile")
    
    # Check if already in cart
    existing = await db.cart_items.find_one({
        "listing_id": listing_id,
        "buyer_id": buyer_id,
        "status": {"$in": ["pending", "confirmed"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Libro già nel carrello")
    
    # Get bookstore
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Create cart item
    now = datetime.utcnow()
    expires_at = now + timedelta(hours=24)
    
    cart_item = {
        "id": str(uuid.uuid4()),
        "listing_id": listing_id,
        "buyer_id": buyer_id,
        "seller_id": listing["seller_id"],
        "book_isbn": listing.get("book_isbn", ""),
        "book_titolo": listing.get("book_titolo", ""),
        "book_editore": listing.get("book_editore", ""),
        "prezzo": listing.get("prezzo_vendita", 0),
        "bookstore_id": bookstore_id,
        "bookstore_nome": bookstore.get("nome", ""),
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    
    await db.cart_items.insert_one(cart_item)
    
    # Update listing status to reserved
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "reserved", "reserved_by": buyer_id, "reserved_at": now.isoformat()}}
    )
    
    # Create notification for seller
    buyer = await db.users.find_one({"id": buyer_id})
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": listing["seller_id"],
        "type": "confirmation_request",
        "title": "Richiesta di conferma",
        "message": f"{buyer.get('username', 'Un utente')} vuole acquistare '{listing.get('book_titolo', 'un libro')}'",
        "data": {
            "cart_item_id": cart_item["id"],
            "listing_id": listing_id,
            "buyer_id": buyer_id
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    cart_item.pop('_id', None)
    return {"message": "Libro aggiunto al carrello. In attesa di conferma del venditore.", "cart_item": cart_item}


@api_router.get("/cart/{user_id}")
async def get_cart(user_id: str):
    """Ottiene il carrello dell'utente con lo stato di ogni libro"""
    from datetime import timedelta
    
    now = datetime.utcnow()
    
    # Get all cart items for user
    cart_items = await db.cart_items.find({
        "buyer_id": user_id,
        "status": {"$in": ["pending", "confirmed"]}
    }).to_list(50)
    
    result = []
    for item in cart_items:
        item.pop('_id', None)
        
        # Check if expired (24 hours)
        expires_at = datetime.fromisoformat(item.get("expires_at", now.isoformat()))
        if item["status"] == "pending" and now > expires_at:
            # Mark as expired
            await db.cart_items.update_one(
                {"id": item["id"]},
                {"$set": {"status": "expired"}}
            )
            item["status"] = "expired"
            # Restore listing to available
            await db.listings.update_one(
                {"id": item["listing_id"]},
                {"$set": {"status": "available"}, "$unset": {"reserved_by": "", "reserved_at": ""}}
            )
        
        # Get listing details
        listing = await db.listings.find_one({"id": item["listing_id"]})
        if listing:
            item["condizione"] = listing.get("condizione", "")
            item["condition_details"] = listing.get("condition_details", {})
        
        result.append(item)
    
    # Separate by status
    confirmed = [i for i in result if i["status"] == "confirmed"]
    pending = [i for i in result if i["status"] == "pending"]
    expired = [i for i in result if i["status"] == "expired"]
    
    return {
        "items": result,
        "confirmed": confirmed,
        "pending": pending,
        "expired": expired,
        "total_confirmed": len(confirmed),
        "total_pending": len(pending),
        "can_checkout": len(confirmed) > 0 and len(pending) == 0
    }


@api_router.post("/cart/{cart_item_id}/confirm")
async def seller_confirm_cart_item(cart_item_id: str, seller_id: str):
    """Il venditore conferma la disponibilità del libro"""
    
    cart_item = await db.cart_items.find_one({
        "id": cart_item_id,
        "seller_id": seller_id,
        "status": "pending"
    })
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    
    now = datetime.utcnow()
    
    # Update cart item
    await db.cart_items.update_one(
        {"id": cart_item_id},
        {"$set": {"status": "confirmed", "seller_response_at": now.isoformat()}}
    )
    
    # Notify buyer
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": cart_item["buyer_id"],
        "type": "confirmation_accepted",
        "title": "Libro confermato!",
        "message": f"Il venditore ha confermato '{cart_item.get('book_titolo', 'il libro')}'. Puoi procedere al pagamento.",
        "data": {"cart_item_id": cart_item_id, "listing_id": cart_item["listing_id"]},
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Libro confermato", "status": "confirmed"}


@api_router.post("/cart/{cart_item_id}/reject")
async def seller_reject_cart_item(cart_item_id: str, seller_id: str):
    """Il venditore rifiuta - libro non disponibile"""
    
    cart_item = await db.cart_items.find_one({
        "id": cart_item_id,
        "seller_id": seller_id,
        "status": "pending"
    })
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    
    now = datetime.utcnow()
    
    # Update cart item
    await db.cart_items.update_one(
        {"id": cart_item_id},
        {"$set": {"status": "rejected", "seller_response_at": now.isoformat()}}
    )
    
    # Mark listing as unavailable (sparisce dal radar)
    await db.listings.update_one(
        {"id": cart_item["listing_id"]},
        {"$set": {"status": "unavailable"}}
    )
    
    # Notify buyer
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": cart_item["buyer_id"],
        "type": "confirmation_rejected",
        "title": "Libro non disponibile",
        "message": f"Il venditore ha indicato che '{cart_item.get('book_titolo', 'il libro')}' non è più disponibile.",
        "data": {"cart_item_id": cart_item_id, "listing_id": cart_item["listing_id"]},
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {"message": "Libro rifiutato", "status": "rejected"}


@api_router.delete("/cart/{cart_item_id}")
async def remove_from_cart(cart_item_id: str, buyer_id: str):
    """Rimuove un libro dal carrello"""
    
    cart_item = await db.cart_items.find_one({
        "id": cart_item_id,
        "buyer_id": buyer_id
    })
    
    if not cart_item:
        raise HTTPException(status_code=404, detail="Elemento non trovato nel carrello")
    
    # Delete cart item
    await db.cart_items.delete_one({"id": cart_item_id})
    
    # Restore listing to available (only if it was reserved by this buyer)
    await db.listings.update_one(
        {"id": cart_item["listing_id"], "reserved_by": buyer_id},
        {"$set": {"status": "available"}, "$unset": {"reserved_by": "", "reserved_at": ""}}
    )
    
    return {"message": "Libro rimosso dal carrello"}


@api_router.get("/seller/{seller_id}/pending-confirmations")
async def get_pending_confirmations(seller_id: str):
    """Ottiene le richieste di conferma in attesa per il venditore"""
    
    pending = await db.cart_items.find({
        "seller_id": seller_id,
        "status": "pending"
    }).to_list(50)
    
    result = []
    for item in pending:
        item.pop('_id', None)
        # Get buyer info
        buyer = await db.users.find_one({"id": item["buyer_id"]})
        if buyer:
            item["buyer_username"] = buyer.get("username", "Utente")
        result.append(item)
    
    return result


# ==================== FINE SISTEMA CARRELLO ====================


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

# ============== PAYMENT & ORDER SYSTEM (MOCK/ESCROW) ==============

@api_router.post("/listings/{listing_id}/reset")
async def reset_listing(listing_id: str):
    """Resetta un listing a disponibile (per testing)"""
    result = await db.listings.update_one(
        {"id": listing_id},
        {
            "$set": {"stato": "disponibile", "status": "available"},
            "$unset": {"reserved_by": "", "order_id": ""}
        }
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Listing non trovato")
    return {"success": True, "message": "Listing resettato a disponibile"}

@api_router.post("/orders/create")
async def create_order(
    user_id: str = Query(...),
    listing_id: str = Query(None),
    bookstore_id: str = Query(None),
    request: CreateOrderRequest = None
):
    """Crea un nuovo ordine a partire da un listing"""
    
    # Supporta sia query params che body JSON
    actual_listing_id = listing_id
    actual_bookstore_id = bookstore_id
    
    if request:
        actual_listing_id = actual_listing_id or request.listing_id
        actual_bookstore_id = actual_bookstore_id or request.bookstore_id
    
    if not actual_listing_id or not actual_bookstore_id:
        raise HTTPException(status_code=400, detail="listing_id e bookstore_id sono richiesti")
    
    # Verifica utente
    buyer = await db.users.find_one({"id": user_id})
    if not buyer:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Verifica listing
    listing = await db.listings.find_one({
        "id": actual_listing_id, 
        "$or": [
            {"status": "available"},
            {"stato": "disponibile"}
        ]
    })
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non disponibile")
    
    # Non puoi comprare i tuoi libri
    if listing.get("seller_id") == user_id:
        raise HTTPException(status_code=400, detail="Non puoi acquistare i tuoi libri")
    
    # Verifica cartolibreria
    bookstore = await db.bookstores.find_one({"id": actual_bookstore_id})
    if not bookstore:
        # Cerca per nome parziale
        bookstore = await db.bookstores.find_one({"nome": {"$regex": actual_bookstore_id, "$options": "i"}})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Ottieni info venditore
    seller = await db.users.find_one({"id": listing.get("seller_id")})
    seller_name = seller.get("username", "Venditore") if seller else "Venditore"
    
    # Calcola prezzi
    prezzo_libro = listing.get("prezzo_vendita", listing.get("prezzo", 0))
    commissione_app = prezzo_libro * 0.12  # 12% app
    commissione_cartolibreria = prezzo_libro * 0.05  # 5% cartolibreria
    totale_acquirente = prezzo_libro + commissione_app + commissione_cartolibreria  # +17%
    netto_venditore = prezzo_libro  # Il venditore riceve il prezzo del libro
    
    # Crea ordine
    order = Order(
        buyer_id=user_id,
        buyer_name=buyer.get("username", "Acquirente"),
        seller_id=listing.get("seller_id"),
        seller_name=seller_name,
        listing_id=listing.get("id"),
        bookstore_id=bookstore.get("id"),
        bookstore_name=bookstore.get("nome"),
        book_isbn=listing.get("book_isbn", ""),
        book_titolo=listing.get("book_titolo", ""),
        book_autore=listing.get("book_autore", ""),
        prezzo_libro=round(prezzo_libro, 2),
        commissione_app=round(commissione_app, 2),
        commissione_cartolibreria=round(commissione_cartolibreria, 2),
        totale_acquirente=round(totale_acquirente, 2),
        netto_venditore=round(netto_venditore, 2),
        status="pending_seller_confirmation",  # Prima deve confermare il venditore
        status_history=[{
            "status": "pending_seller_confirmation",
            "timestamp": datetime.utcnow().isoformat(),
            "note": "In attesa di conferma disponibilità dal venditore"
        }]
    )
    
    await db.orders.insert_one(order.dict())
    
    # Segna il listing come riservato (usa entrambi i campi per compatibilità)
    await db.listings.update_one(
        {"id": listing.get("id")},
        {"$set": {
            "status": "reserved", 
            "stato": "riservato",
            "reserved_by": user_id, 
            "order_id": order.id
        }}
    )
    
    # Notifica al venditore per confermare la disponibilità
    notification_seller = {
        "id": str(uuid.uuid4()),
        "user_id": listing.get("seller_id"),
        "type": "seller_confirmation_request",
        "title": "RICHIESTA D'ACQUISTO",
        "message": f"RICHIESTA D'ACQUISTO PER:\n{order.book_titolo}\n\nCONFERMA LA DISPONIBILITÀ ENTRO 24H",
        "order_id": order.id,
        "data": {
            "order_id": order.id,
            "book_titolo": order.book_titolo,
            "buyer_name": order.buyer_name,
            "bookstore_name": order.bookstore_name,
            "prezzo": order.netto_venditore
        },
        "read": False,
        "created_at": datetime.utcnow().isoformat()
    }
    await db.notifications.insert_one(notification_seller)
    
    # Notifica all'acquirente
    notification_buyer = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "order_pending",
        "title": "RICHIESTA INVIATA",
        "message": f"LA TUA RICHIESTA PER:\n{order.book_titolo}\n\nÈ STATA INVIATA AL VENDITORE\n\nIL VENDITORE DOVRÀ CONFERMARE LA DISPONIBILITÀ ENTRO 24H",
        "order_id": order.id,
        "data": {
            "order_id": order.id,
            "book_titolo": order.book_titolo
        },
        "read": False,
        "created_at": datetime.utcnow().isoformat()
    }
    await db.notifications.insert_one(notification_buyer)
    
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "totale": order.totale_acquirente,
        "status": order.status,
        "message": "Richiesta inviata! Il venditore deve confermare la disponibilità."
    }

@api_router.post("/orders/{order_id}/seller-confirm")
async def seller_confirm_order(order_id: str, user_id: str = Query(...)):
    """Venditore conferma la disponibilità del libro"""
    
    order = await db.orders.find_one({"id": order_id, "seller_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "pending_seller_confirmation":
        raise HTTPException(status_code=400, detail="Ordine non in attesa di conferma")
    
    now = datetime.utcnow()
    
    # Aggiorna ordine - ora può essere pagato
    update_data = {
        "status": "pending_payment",
        "seller_confirmed_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "pending_payment",
            "timestamp": now.isoformat(),
            "note": "Venditore ha confermato la disponibilità"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Elimina/segna come processata la notifica del venditore
    await db.notifications.delete_many({
        "user_id": user_id,
        "order_id": order_id,
        "type": "seller_confirmation_request"
    })
    
    # Notifica all'acquirente che può pagare
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "ready_for_payment",
        "title": "COMPLIMENTI! LIBRO DISPONIBILE",
        "message": f"COMPLIMENTI!\n{order.get('book_titolo')}\nÈ DISPONIBILE!\n\nAGGIUNGI AL CARRELLO PER COMPLETARE L'ACQUISTO",
        "order_id": order_id,
        "data": {
            "order_id": order_id,
            "book_titolo": order.get("book_titolo"),
            "totale": order.get("totale_acquirente")
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "message": "Disponibilità confermata! L'acquirente è stato notificato."
    }

@api_router.post("/orders/{order_id}/seller-reject")
async def seller_reject_order(order_id: str, user_id: str = Query(...), reason: str = Query("")):
    """Venditore rifiuta/annulla l'ordine"""
    
    order = await db.orders.find_one({"id": order_id, "seller_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "pending_seller_confirmation":
        raise HTTPException(status_code=400, detail="Ordine non può essere rifiutato")
    
    now = datetime.utcnow()
    
    # Aggiorna ordine
    update_data = {
        "status": "cancelled",
        "cancelled_at": now,
        "cancellation_reason": reason or "Libro non disponibile",
        "status_history": order.get("status_history", []) + [{
            "status": "cancelled",
            "timestamp": now.isoformat(),
            "note": f"Rifiutato dal venditore: {reason or 'Libro non disponibile'}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Rimetti il listing come disponibile
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "available"}, "$unset": {"reserved_by": "", "order_id": ""}}
    )
    
    # Notifica all'acquirente
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "order_rejected",
        "title": "CI DISPIACE!",
        "message": f"CI DISPIACE!\nIL TESTO RICHIESTO:\n{order.get('book_titolo')}\n\nNON È PIÙ DISPONIBILE",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "message": "Ordine rifiutato."
    }

@api_router.post("/orders/{order_id}/pay")
async def pay_order(order_id: str, user_id: str = Query(...)):
    """Simula il pagamento e mette i fondi in escrow"""
    
    order = await db.orders.find_one({"id": order_id, "buyer_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "pending_payment":
        raise HTTPException(status_code=400, detail=f"Ordine non in attesa di pagamento. Stato: {order.get('status')}")
    
    # Simula PaymentIntent di Stripe
    payment_intent_id = f"pi_mock_{uuid.uuid4().hex[:16]}"
    
    # Aggiorna ordine
    now = datetime.utcnow()
    update_data = {
        "payment_intent_id": payment_intent_id,
        "payment_status": "paid",
        "status": "paid_escrow",
        "paid_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "paid_escrow",
            "timestamp": now.isoformat(),
            "note": "Pagamento ricevuto - fondi in escrow"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Aggiorna listing come riservato
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "reserved", "reserved_by": user_id, "order_id": order_id}}
    )
    
    # Notifica al venditore con QR code
    seller_notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "order_qr_code",
        "title": "🎉 VENDITA COMPLETATA!",
        "message": f"COMPLIMENTI!\n{order.get('book_titolo')}\nÈ STATO VENDUTO!\n\nCODICE CONSEGNA: {order.get('order_code')}\n\nCONSEGNA ENTRO 2 GIORNI LAVORATIVI PRESSO:\n{order.get('bookstore_name')}\n\nMostra questo codice o il QR alla cartolibreria quando consegni il libro.\n\n📸 Ti consigliamo di fare uno screenshot!",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "data": {
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": True,
            "role": "seller"
        },
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(seller_notification)
    
    # Notifica alla cartolibreria che riceverà un libro
    bookstore_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": order.get("bookstore_id"),
        "type": "incoming_order",
        "title": "NUOVO ORDINE IN ARRIVO",
        "message": f"ORDINE: {order.get('order_code')}\n\nLIBRO: {order.get('book_titolo')}\n\nVENDITORE: {order.get('seller_name')}\nACQUIRENTE: {order.get('buyer_name')}\n\n1️⃣ Scansiona QR del VENDITORE quando consegna\n2️⃣ Scansiona QR dell'ACQUIRENTE quando ritira",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "seller_name": order.get("seller_name"),
        "buyer_name": order.get("buyer_name"),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_notification)
    
    # Notifica all'acquirente con QR code
    buyer_qr_notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "order_qr_code",
        "title": "🎉 ACQUISTO COMPLETATO!",
        "message": f"Il tuo ordine per:\n{order.get('book_titolo')}\n\nCODICE RITIRO: {order.get('order_code')}\n\nMostra questo codice o il QR alla cartolibreria quando ritiri il libro.\n\n📸 Ti consigliamo di fare uno screenshot di questa notifica!",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "data": {
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": True
        },
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(buyer_qr_notification)
    
    return {
        "success": True,
        "order_id": order_id,
        "status": "paid_escrow",
        "message": "Pagamento completato! I fondi sono in escrow fino alla conferma del ritiro."
    }

@api_router.post("/orders/pay-batch")
async def pay_orders_batch(user_id: str = Query(...), order_ids: str = Query(...)):
    """
    Paga più ordini insieme.
    Se più ordini sono dello stesso venditore + stessa cartolibreria, genera un UNICO QR code condiviso.
    """
    ids = [x.strip() for x in order_ids.split(",") if x.strip()]
    
    if not ids:
        raise HTTPException(status_code=400, detail="Nessun ordine specificato")
    
    # Carica tutti gli ordini
    orders = await db.orders.find({
        "id": {"$in": ids},
        "buyer_id": user_id,
        "status": "pending_payment"
    }).to_list(50)
    
    if len(orders) != len(ids):
        raise HTTPException(status_code=400, detail="Alcuni ordini non trovati o non pagabili")
    
    # Raggruppa per venditore + cartolibreria
    from collections import defaultdict
    groups = defaultdict(list)
    for order in orders:
        key = (order.get("seller_id"), order.get("bookstore_id"))
        groups[key].append(order)
    
    now = datetime.utcnow()
    paid_orders = []
    
    for (seller_id, bookstore_id), group_orders in groups.items():
        # Se più ordini dallo stesso venditore, usa un unico codice
        if len(group_orders) > 1:
            # Genera un codice batch
            batch_code = generate_order_code()
            batch_id = str(uuid.uuid4())
        else:
            batch_code = group_orders[0].get("order_code")
            batch_id = group_orders[0].get("id")
        
        # Calcola totali del gruppo
        total_amount = sum(o.get("totale_acquirente", 0) for o in group_orders)
        total_netto = sum(o.get("netto_venditore", 0) for o in group_orders)
        book_titles = [o.get("book_titolo", "")[:40] for o in group_orders]
        
        # Paga tutti gli ordini del gruppo
        for order in group_orders:
            payment_intent_id = f"pi_mock_{uuid.uuid4().hex[:16]}"
            update_data = {
                "payment_intent_id": payment_intent_id,
                "payment_status": "paid",
                "status": "paid_escrow",
                "paid_at": now,
                "batch_code": batch_code if len(group_orders) > 1 else None,
                "batch_id": batch_id if len(group_orders) > 1 else None,
                "status_history": order.get("status_history", []) + [{
                    "status": "paid_escrow",
                    "timestamp": now.isoformat(),
                    "note": f"Pagamento batch - codice condiviso: {batch_code}" if len(group_orders) > 1 else "Pagamento ricevuto"
                }]
            }
            await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
            
            # Riserva il listing
            await db.listings.update_one(
                {"id": order.get("listing_id")},
                {"$set": {"status": "reserved", "reserved_by": user_id, "order_id": order.get("id")}}
            )
            paid_orders.append(order)
        
        # Notifica al venditore - UNA SOLA per tutto il gruppo
        if len(group_orders) > 1:
            books_list = "\n".join([f"• {t}" for t in book_titles])
            seller_message = f"COMPLIMENTI! {len(group_orders)} LIBRI VENDUTI!\n\n{books_list}\n\nCODICE CONSEGNA UNICO: {batch_code}\n\nCONSEGNA ENTRO 2 GIORNI LAVORATIVI PRESSO:\n{group_orders[0].get('bookstore_name')}\n\nMostra questo codice alla cartolibreria.\nTutti i libri con lo stesso codice!\n\n📸 Fai uno screenshot!"
        else:
            seller_message = f"COMPLIMENTI!\n{book_titles[0]}\nÈ STATO VENDUTO!\n\nCODICE CONSEGNA: {batch_code}\n\nCONSEGNA ENTRO 2 GIORNI PRESSO:\n{group_orders[0].get('bookstore_name')}\n\n📸 Fai uno screenshot!"
        
        seller_notification = {
            "id": str(uuid.uuid4()),
            "user_id": seller_id,
            "type": "order_qr_code",
            "title": f"🎉 {'VENDITE COMPLETATE!' if len(group_orders) > 1 else 'VENDITA COMPLETATA!'}",
            "message": seller_message,
            "order_id": batch_id,
            "order_code": batch_code,
            "bookstore_name": group_orders[0].get("bookstore_name"),
            "data": {
                "order_ids": [o.get("id") for o in group_orders],
                "order_code": batch_code,
                "books": book_titles,
                "total_count": len(group_orders),
                "bookstore_name": group_orders[0].get("bookstore_name"),
                "show_qr": True,
                "role": "seller"
            },
            "read": False,
            "persistent": True,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(seller_notification)
        
        # Notifica all'acquirente - UNA SOLA per tutto il gruppo
        if len(group_orders) > 1:
            buyer_message = f"HAI ACQUISTATO {len(group_orders)} LIBRI!\n\n{books_list}\n\nCODICE RITIRO UNICO: {batch_code}\n\nRITIRA PRESSO:\n{group_orders[0].get('bookstore_name')}\n\nMostra questo codice alla cartolibreria.\nTutti i libri con lo stesso codice!\n\n📸 Fai uno screenshot!"
        else:
            buyer_message = f"Il tuo ordine per:\n{book_titles[0]}\n\nCODICE RITIRO: {batch_code}\n\nRITIRA PRESSO:\n{group_orders[0].get('bookstore_name')}\n\n📸 Fai uno screenshot!"
        
        buyer_qr_notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "order_qr_code",
            "title": f"🎉 {'ACQUISTI COMPLETATI!' if len(group_orders) > 1 else 'ACQUISTO COMPLETATO!'}",
            "message": buyer_message,
            "order_id": batch_id,
            "order_code": batch_code,
            "bookstore_name": group_orders[0].get("bookstore_name"),
            "data": {
                "order_ids": [o.get("id") for o in group_orders],
                "order_code": batch_code,
                "books": book_titles,
                "total_count": len(group_orders),
                "bookstore_name": group_orders[0].get("bookstore_name"),
                "total_amount": total_amount,
                "show_qr": True
            },
            "read": False,
            "persistent": True,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(buyer_qr_notification)
        
        # Notifica alla cartolibreria
        bookstore_notification = {
            "id": str(uuid.uuid4()),
            "bookstore_id": bookstore_id,
            "type": "incoming_order",
            "title": f"{'ORDINE MULTIPLO' if len(group_orders) > 1 else 'NUOVO ORDINE'} IN ARRIVO",
            "message": f"CODICE: {batch_code}\n\n{'LIBRI:' if len(group_orders) > 1 else 'LIBRO:'}\n{books_list if len(group_orders) > 1 else book_titles[0]}\n\nVENDITORE: {group_orders[0].get('seller_name')}\nACQUIRENTE: {group_orders[0].get('buyer_name')}",
            "order_id": batch_id,
            "order_code": batch_code,
            "order_count": len(group_orders),
            "read": False,
            "created_at": now.isoformat()
        }
        await db.bookstore_notifications.insert_one(bookstore_notification)
    
    return {
        "success": True,
        "paid_count": len(paid_orders),
        "total_amount": sum(o.get("totale_acquirente", 0) for o in paid_orders),
        "message": f"Pagati {len(paid_orders)} ordini con successo!"
    }

@api_router.post("/orders/{order_id}/deliver-to-bookstore")
async def mark_delivered_to_bookstore(order_id: str, user_id: str = Query(...)):
    """Il venditore conferma di aver consegnato il libro alla cartolibreria"""
    
    order = await db.orders.find_one({"id": order_id, "seller_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "paid_escrow":
        raise HTTPException(status_code=400, detail="L'ordine deve essere pagato prima della consegna")
    
    now = datetime.utcnow()
    update_data = {
        "status": "delivering_to_bookstore",
        "delivered_to_bookstore_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "delivering_to_bookstore",
            "timestamp": now.isoformat(),
            "note": "Libro consegnato alla cartolibreria"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Notifica all'acquirente
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "book_at_bookstore",
        "title": "Libro in arrivo!",
        "message": f"Il venditore ha consegnato '{order.get('book_titolo')[:40]}' presso {order.get('bookstore_name')}. Riceverai una notifica quando sarà pronto.",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {"success": True, "status": "delivering_to_bookstore"}

@api_router.post("/orders/{order_id}/ready-for-pickup")
async def mark_ready_for_pickup(order_id: str, bookstore_id: str = Query(None)):
    """La cartolibreria conferma che il libro è pronto per il ritiro"""
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") not in ["delivering_to_bookstore", "paid_escrow"]:
        raise HTTPException(status_code=400, detail="Stato ordine non valido per questa operazione")
    
    now = datetime.utcnow()
    # Deadline escrow: 2 giorni da ora
    from datetime import timedelta
    escrow_deadline = now + timedelta(days=2)
    
    update_data = {
        "status": "ready_for_pickup",
        "ready_for_pickup_at": now,
        "escrow_release_deadline": escrow_deadline,
        "status_history": order.get("status_history", []) + [{
            "status": "ready_for_pickup",
            "timestamp": now.isoformat(),
            "note": f"Libro pronto per il ritiro presso la cartolibreria. Deadline escrow: {escrow_deadline.isoformat()}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Notifica all'acquirente
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "ready_for_pickup",
        "title": "LIBRO PRONTO PER IL RITIRO",
        "message": f"{order.get('book_titolo')}\n\nÈ DISPONIBILE PER IL RITIRO PRESSO:\n{order.get('bookstore_name')}\n\nCodice ritiro: {order.get('order_code')}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "status": "ready_for_pickup",
        "escrow_deadline": escrow_deadline.isoformat()
    }

@api_router.post("/orders/{order_id}/confirm-pickup")
async def confirm_pickup(order_id: str, user_id: str = Query(...)):
    """L'acquirente conferma il ritiro - sblocca i fondi al venditore"""
    
    order = await db.orders.find_one({"id": order_id, "buyer_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "ready_for_pickup":
        raise HTTPException(status_code=400, detail="Il libro non è ancora pronto per il ritiro")
    
    now = datetime.utcnow()
    
    # Aggiorna ordine a completato
    update_data = {
        "status": "completed",
        "payment_status": "released",
        "picked_up_at": now,
        "completed_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "picked_up",
            "timestamp": now.isoformat(),
            "note": "Ritiro confermato dall'acquirente"
        }, {
            "status": "completed",
            "timestamp": now.isoformat(),
            "note": f"Pagamento di €{order.get('netto_venditore', 0):.2f} rilasciato al venditore"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Aggiorna listing come venduto
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "sold", "sold_at": now, "sold_to": user_id}}
    )
    
    # Notifica al venditore
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "payment_released",
        "title": "FONDI IN ARRIVO!",
        "message": f"FONDI IN ARRIVO PER:\n{order.get('book_titolo')}\n\nImporto: €{order.get('netto_venditore', 0):.2f}",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "status": "completed",
        "message": "Ritiro confermato! Il venditore riceverà il pagamento."
    }

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user_id: str = Query(...)):
    """Ottieni dettagli ordine"""
    
    order = await db.orders.find_one({
        "id": order_id,
        "$or": [{"buyer_id": user_id}, {"seller_id": user_id}]
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    order.pop('_id', None)
    order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
    order["is_buyer"] = order.get("buyer_id") == user_id
    order["is_seller"] = order.get("seller_id") == user_id
    
    return order

@api_router.get("/orders/user/{user_id}")
async def get_user_orders(user_id: str, role: str = Query("all")):
    """Ottieni tutti gli ordini di un utente (come acquirente o venditore)"""
    
    query = {}
    if role == "buyer":
        query["buyer_id"] = user_id
    elif role == "seller":
        query["seller_id"] = user_id
    else:
        query["$or"] = [{"buyer_id": user_id}, {"seller_id": user_id}]
    
    orders = await db.orders.find(query).sort("created_at", -1).to_list(100)
    
    for order in orders:
        order.pop('_id', None)
        order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
        order["is_buyer"] = order.get("buyer_id") == user_id
        order["is_seller"] = order.get("seller_id") == user_id
    
    return {"orders": orders, "total": len(orders)}

@api_router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, user_id: str = Query(...), reason: str = Query("")):
    """Annulla un ordine (solo se non ancora pagato o con rimborso)"""
    
    order = await db.orders.find_one({
        "id": order_id,
        "$or": [{"buyer_id": user_id}, {"seller_id": user_id}]
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    # Può essere annullato solo se in pending_seller_confirmation, pending_payment o paid_escrow (con rimborso simulato)
    if order.get("status") not in ["pending_seller_confirmation", "pending_payment", "paid_escrow"]:
        raise HTTPException(status_code=400, detail="Ordine non annullabile in questo stato")
    
    now = datetime.utcnow()
    is_refund = order.get("status") == "paid_escrow"
    
    update_data = {
        "status": "refunded" if is_refund else "cancelled",
        "payment_status": "refunded" if is_refund else "cancelled",
        "status_history": order.get("status_history", []) + [{
            "status": "refunded" if is_refund else "cancelled",
            "timestamp": now.isoformat(),
            "note": f"Annullato da {'acquirente' if order.get('buyer_id') == user_id else 'venditore'}. {reason}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Ripristina listing
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "available"}, "$unset": {"reserved_by": "", "order_id": ""}}
    )
    
    # Notifica all'altra parte
    other_user_id = order.get("seller_id") if order.get("buyer_id") == user_id else order.get("buyer_id")
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": other_user_id,
        "type": "order_cancelled",
        "title": "Ordine annullato",
        "message": f"L'ordine per '{order.get('book_titolo')[:40]}' è stato annullato." + (" Il rimborso è stato elaborato." if is_refund else ""),
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "status": "refunded" if is_refund else "cancelled",
        "refunded": is_refund
    }

@api_router.post("/orders/process-escrow-releases")
async def process_escrow_releases():
    """Job automatico: rilascia i pagamenti dopo 2 giorni dalla disponibilità per il ritiro"""
    
    now = datetime.utcnow()
    
    # Trova ordini con escrow scaduto
    expired_orders = await db.orders.find({
        "status": "ready_for_pickup",
        "escrow_release_deadline": {"$lt": now}
    }).to_list(100)
    
    released_count = 0
    
    for order in expired_orders:
        # Auto-completa l'ordine
        update_data = {
            "status": "completed",
            "payment_status": "released",
            "completed_at": now,
            "status_history": order.get("status_history", []) + [{
                "status": "completed",
                "timestamp": now.isoformat(),
                "note": "Auto-completato: deadline escrow raggiunta senza conferma ritiro"
            }]
        }
        
        await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
        
        # Aggiorna listing
        await db.listings.update_one(
            {"id": order.get("listing_id")},
            {"$set": {"status": "sold", "sold_at": now}}
        )
        
        # Notifica al venditore
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "payment_released",
            "title": "Pagamento automatico rilasciato",
            "message": f"Il pagamento per '{order.get('book_titolo')[:40]}' è stato rilasciato automaticamente (deadline escrow).",
            "order_id": order.get("id"),
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification)
        
        released_count += 1
    
    return {"processed": released_count, "message": f"{released_count} ordini completati automaticamente"}

# ============== SELLER BANK ACCOUNT (Mock per Stripe Connect) ==============

@api_router.post("/seller/bank-account")
async def add_bank_account(user_id: str = Query(...), account_holder_name: str = Query(...), iban: str = Query(...)):
    """Aggiunge un conto bancario al venditore (mock per Stripe Connect)"""
    
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # Verifica formato IBAN (semplificato)
    if len(iban.replace(" ", "")) < 15:
        raise HTTPException(status_code=400, detail="IBAN non valido")
    
    bank_account = SellerBankAccount(
        user_id=user_id,
        account_holder_name=account_holder_name,
        iban=iban.replace(" ", "").upper(),
        is_verified=True  # In mock, verifichiamo subito
    )
    
    # Salva o aggiorna
    existing = await db.bank_accounts.find_one({"user_id": user_id})
    if existing:
        await db.bank_accounts.update_one(
            {"user_id": user_id},
            {"$set": bank_account.dict()}
        )
    else:
        await db.bank_accounts.insert_one(bank_account.dict())
    
    # Aggiorna utente
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"has_bank_account": True, "bank_account_verified": True}}
    )
    
    return {
        "success": True,
        "message": "Conto bancario aggiunto con successo",
        "iban_masked": f"****{iban[-4:]}"
    }

@api_router.get("/seller/bank-account/{user_id}")
async def get_bank_account(user_id: str):
    """Ottieni info conto bancario (mascherato)"""
    
    account = await db.bank_accounts.find_one({"user_id": user_id})
    if not account:
        return {"has_account": False}
    
    return {
        "has_account": True,
        "account_holder_name": account.get("account_holder_name"),
        "iban_masked": f"****{account.get('iban', '')[-4:]}",
        "is_verified": account.get("is_verified", False)
    }

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

# ============== BOOKSTORE REGISTRATION SYSTEM ==============

@api_router.post("/bookstore/registration-request")
async def submit_bookstore_registration(data: BookstoreRegistrationRequestCreate):
    """Cartolibreria invia richiesta di registrazione"""
    
    # Verifica email non già registrata
    existing = await db.bookstores.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata come cartolibreria")
    
    # Verifica richiesta pendente
    pending = await db.bookstore_requests.find_one({
        "email": data.email.lower(),
        "status": "pending"
    })
    if pending:
        raise HTTPException(status_code=400, detail="Richiesta già in attesa di approvazione")
    
    request = BookstoreRegistrationRequest(
        nome_attivita=data.nome_attivita,
        email=data.email.lower(),
        partita_iva=data.partita_iva,
        indirizzo=data.indirizzo or "",
        citta=data.citta or "",
        telefono=data.telefono or "",
        status="pending"
    )
    
    await db.bookstore_requests.insert_one(request.dict())
    
    return {
        "success": True,
        "request_id": request.id,
        "message": "Richiesta inviata! Riceverai la password via email dopo l'approvazione."
    }

@api_router.get("/admin/bookstore-requests")
async def get_bookstore_requests(admin_id: str = Query(...)):
    """Admin: visualizza tutte le richieste di registrazione cartolibrerie"""
    
    # In sviluppo: accetta qualsiasi utente come admin
    # In produzione: verificare is_admin nel database
    # admin = await db.users.find_one({"id": admin_id})
    # if not admin or not admin.get("is_admin", False):
    #     raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    requests = await db.bookstore_requests.find().sort("created_at", -1).to_list(100)
    
    for req in requests:
        req.pop('_id', None)
    
    return {"requests": requests}

@api_router.post("/admin/bookstore-requests/{request_id}/approve")
async def approve_bookstore_request(request_id: str, admin_id: str = Query(...)):
    """Admin: approva richiesta cartolibreria e genera password"""
    
    # In sviluppo: accetta qualsiasi utente come admin
    # In produzione: verificare is_admin nel database
    
    request = await db.bookstore_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Richiesta già processata")
    
    # Genera password
    password = generate_bookstore_password()
    
    # Crea cartolibreria
    bookstore = Bookstore(
        nome=request["nome_attivita"],
        indirizzo=request.get("indirizzo", ""),
        citta=request.get("citta", ""),
        telefono=request.get("telefono", ""),
        email=request["email"],
        password_hash=hash_password(password)
    )
    
    await db.bookstores.insert_one(bookstore.dict())
    
    # Aggiorna richiesta
    now = datetime.utcnow()
    await db.bookstore_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "approved",
            "generated_password": password,
            "approved_at": now,
            "approved_by": admin_id
        }}
    )
    
    return {
        "success": True,
        "bookstore_id": bookstore.id,
        "email": request["email"],
        "password": password,
        "message": f"Cartolibreria approvata! Password generata: {password}"
    }

@api_router.post("/admin/bookstore-requests/{request_id}/reject")
async def reject_bookstore_request(request_id: str, admin_id: str = Query(...), reason: str = Query("")):
    """Admin: rifiuta richiesta cartolibreria"""
    
    # In sviluppo: accetta qualsiasi utente come admin
    
    request = await db.bookstore_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="Richiesta non trovata")
    
    await db.bookstore_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": reason,
            "approved_at": datetime.utcnow(),
            "approved_by": admin_id
        }}
    )
    
    return {"success": True, "message": "Richiesta rifiutata"}

# ============== BOOKSTORE PORTAL ==============

@api_router.post("/bookstore/login")
async def bookstore_login(email: str = Query(...), password: str = Query(...)):
    """Login cartolibreria"""
    
    bookstore = await db.bookstores.find_one({"email": email.lower()})
    if not bookstore:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    if bookstore.get("password_hash") != hash_password(password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    return {
        "success": True,
        "bookstore_id": bookstore["id"],
        "nome": bookstore["nome"],
        "email": bookstore["email"]
    }


@api_router.get("/bookstore/{bookstore_id}/notifications")
async def get_bookstore_notifications(bookstore_id: str):
    """Cartolibreria: visualizza notifiche"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Trova notifiche per questa cartolibreria
    notifications = await db.bookstore_notifications.find({
        "bookstore_id": bookstore_id
    }).sort("created_at", -1).to_list(50)
    
    for n in notifications:
        n.pop('_id', None)
    
    unread_count = sum(1 for n in notifications if not n.get('read', False))
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

@api_router.put("/bookstore/{bookstore_id}/notifications/{notification_id}/read")
async def mark_bookstore_notification_read(bookstore_id: str, notification_id: str):
    """Cartolibreria: segna notifica come letta"""
    
    await db.bookstore_notifications.update_one(
        {"id": notification_id, "bookstore_id": bookstore_id},
        {"$set": {"read": True}}
    )
    return {"success": True}


@api_router.get("/bookstore/{bookstore_id}/orders")
async def get_bookstore_orders(bookstore_id: str):
    """Cartolibreria: visualizza ordini assegnati"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Trova ordini per questa cartolibreria
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": {"$in": ["paid_escrow", "delivering_to_bookstore", "ready_for_pickup"]}
    }).sort("created_at", -1).to_list(100)
    
    for order in orders:
        order.pop('_id', None)
        order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
    
    return {
        "bookstore_name": bookstore["nome"],
        "orders": orders,
        "total": len(orders)
    }

@api_router.post("/bookstore/{bookstore_id}/confirm-seller-delivery")
async def bookstore_confirm_seller_delivery(bookstore_id: str, order_code: str = Query(...)):
    """Cartolibreria: conferma che il VENDITORE ha consegnato il libro (1a scansione)"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Trova ordine per codice
    order = await db.orders.find_one({
        "order_code": order_code.upper(),
        "bookstore_id": bookstore_id
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato con questo codice")
    
    # Deve essere in stato paid_escrow per la consegna del venditore
    if order.get("status") != "paid_escrow":
        current_status = order.get("status")
        if current_status == "ready_for_pickup":
            raise HTTPException(status_code=400, detail="Il libro è già stato consegnato. In attesa del ritiro dell'acquirente.")
        if current_status == "completed":
            raise HTTPException(status_code=400, detail="Ordine già completato.")
        raise HTTPException(status_code=400, detail=f"Stato ordine non valido per la consegna: {current_status}")
    
    now = datetime.utcnow()
    
    # Aggiorna ordine a "pronto per il ritiro"
    update_data = {
        "status": "ready_for_pickup",
        "delivered_to_bookstore_at": now,
        "ready_for_pickup_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "ready_for_pickup",
            "timestamp": now.isoformat(),
            "note": f"Libro consegnato dal venditore alla cartolibreria {bookstore['nome']}"
        }]
    }
    
    await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
    
    # Notifica all'ACQUIRENTE che può ritirare
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "ready_for_pickup",
        "title": "📦 IL TUO LIBRO È PRONTO!",
        "message": f"Il libro:\n{order.get('book_titolo')}\n\nÈ PRONTO PER IL RITIRO PRESSO:\n{bookstore['nome']}\n\nMostra il codice {order.get('order_code')} o il QR che hai nelle notifiche.",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "bookstore_name": bookstore['nome'],
        "data": {
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "bookstore_name": bookstore['nome']
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "message": f"Consegna venditore confermata! L'acquirente {order.get('buyer_name')} è stato notificato.",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "book_titolo": order.get("book_titolo"),
        "buyer_name": order.get("buyer_name"),
        "next_step": "In attesa del ritiro dell'acquirente"
    }

@api_router.post("/bookstore/{bookstore_id}/confirm-pickup-by-code")
async def bookstore_confirm_pickup_by_code(bookstore_id: str, order_code: str = Query(...)):
    """Cartolibreria: conferma ritiro tramite codice ordine (scansione QR o manuale)"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Trova ordine per codice
    order = await db.orders.find_one({
        "order_code": order_code.upper(),
        "bookstore_id": bookstore_id
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato con questo codice")
    
    if order.get("status") != "ready_for_pickup":
        status_label = ORDER_STATES.get(order.get("status"), order.get("status"))
        raise HTTPException(
            status_code=400, 
            detail=f"Ordine non pronto per il ritiro. Stato attuale: {status_label}"
        )
    
    now = datetime.utcnow()
    
    # Aggiorna ordine a completato
    update_data = {
        "status": "completed",
        "payment_status": "released",
        "picked_up_at": now,
        "completed_at": now,
        "confirmed_by_bookstore": True,
        "status_history": order.get("status_history", []) + [{
            "status": "picked_up",
            "timestamp": now.isoformat(),
            "note": f"Ritiro confermato dalla cartolibreria {bookstore['nome']}"
        }, {
            "status": "completed",
            "timestamp": now.isoformat(),
            "note": f"Pagamento di €{order.get('netto_venditore', 0):.2f} rilasciato al venditore"
        }]
    }
    
    await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
    
    # Aggiorna listing come venduto
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "sold", "sold_at": now, "sold_to": order.get("buyer_id")}}
    )
    
    # Notifica al venditore
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "payment_released",
        "title": "Pagamento ricevuto!",
        "message": f"L'acquirente ha ritirato '{order.get('book_titolo')[:40]}'. €{order.get('netto_venditore', 0):.2f} sono stati accreditati.",
        "order_id": order["id"],
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    # Notifica all'acquirente
    notification_buyer = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "pickup_confirmed",
        "title": "Ritiro confermato!",
        "message": f"Hai ritirato '{order.get('book_titolo')[:40]}'. Grazie per aver usato RiLiBro!",
        "order_id": order["id"],
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_buyer)
    
    # Notifica alla cartolibreria - ORDINE COMPLETATO
    bookstore_completed_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": bookstore_id,
        "type": "order_completed",
        "title": "✅ ORDINE COMPLETATO",
        "message": f"Ordine {order.get('order_code')} completato!\n\nLibro: {order.get('book_titolo')}\nAcquirente: {order.get('buyer_name')}\nVenditore: {order.get('seller_name')}",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "commissione_cartolibreria": order.get("commissione_cartolibreria", 0),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_completed_notification)
    
    return {
        "success": True,
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "book_titolo": order.get("book_titolo"),
        "buyer_name": order.get("buyer_name"),
        "message": "Ritiro confermato! Transazione completata."
    }

@api_router.post("/bookstore/{bookstore_id}/mark-ready/{order_id}")
async def bookstore_mark_ready(bookstore_id: str, order_id: str):
    """Cartolibreria: segna ordine come pronto per il ritiro"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    order = await db.orders.find_one({"id": order_id, "bookstore_id": bookstore_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") not in ["paid_escrow", "delivering_to_bookstore"]:
        raise HTTPException(status_code=400, detail="Ordine non in stato valido")
    
    now = datetime.utcnow()
    from datetime import timedelta
    escrow_deadline = now + timedelta(days=2)
    
    update_data = {
        "status": "ready_for_pickup",
        "ready_for_pickup_at": now,
        "escrow_release_deadline": escrow_deadline,
        "status_history": order.get("status_history", []) + [{
            "status": "ready_for_pickup",
            "timestamp": now.isoformat(),
            "note": f"Libro pronto per il ritiro presso {bookstore['nome']}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Notifica all'acquirente
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "ready_for_pickup",
        "title": "Libro pronto per il ritiro!",
        "message": f"'{order.get('book_titolo')[:40]}' è pronto presso {bookstore['nome']}. Codice ritiro: {order.get('order_code')}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "order_code": order.get("order_code"),
        "message": "Ordine segnato come pronto per il ritiro"
    }

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
        # Free: 17% total commission (12% app + 5% bookstore)
        commissione_totale = prezzo * 0.17
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
    # Get both from legacy transactions and new orders
    as_buyer_transactions = await db.transactions.find({"buyer_id": user_id}).to_list(100)
    as_seller_transactions = await db.transactions.find({"seller_id": user_id}).to_list(100)
    
    # Get from orders collection (new escrow system)
    as_buyer_orders = await db.orders.find({
        "buyer_id": user_id,
        "status": {"$in": ["completed", "picked_up", "paid_escrow", "ready_for_pickup"]}
    }).to_list(100)
    as_seller_orders = await db.orders.find({
        "seller_id": user_id,
        "status": {"$in": ["completed", "picked_up", "paid_escrow", "ready_for_pickup"]}
    }).to_list(100)
    
    # Convert orders to transaction format
    def order_to_transaction(order, is_buyer=True):
        return {
            "id": order.get("id"),
            "book_titolo": order.get("book_titolo", ""),
            "buyer_username": order.get("buyer_name", ""),
            "seller_username": order.get("seller_name", ""),
            "bookstore_nome": order.get("bookstore_name", ""),
            "prezzo_totale": order.get("totale_acquirente", 0),
            "commissione_app": order.get("commissione_app", 0),
            "importo_venditore": order.get("netto_venditore", 0),
            "stato": "completato" if order.get("status") == "completed" else "in_custodia",
            "buyer_is_premium": False,
            "created_at": order.get("created_at", ""),
            "order_code": order.get("order_code", "")
        }
    
    # Combine and deduplicate
    acquisti = []
    vendite = []
    
    # Add transactions
    for t in as_buyer_transactions:
        t.pop('_id', None)
        acquisti.append(t)
    for t in as_seller_transactions:
        t.pop('_id', None)
        vendite.append(t)
    
    # Add orders (converted to transaction format)
    for o in as_buyer_orders:
        o.pop('_id', None)
        acquisti.append(order_to_transaction(o, True))
    for o in as_seller_orders:
        o.pop('_id', None)
        vendite.append(order_to_transaction(o, False))
    
    return {
        "acquisti": acquisti,
        "vendite": vendite
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
