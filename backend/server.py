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
from datetime import datetime, timedelta
import random
import string
import hashlib
import base64
import io
import requests
import re
import httpx

# Book logic module for complex classification
from book_logic import (
    get_ciclo_info,
    calcola_stato_acquisto,
    calcola_vendibili,
    get_scuole_catanzaro,
    SCUOLE_MEDIE_CATANZARO,
    SCUOLE_SUPERIORI_CATANZARO
)

# NEW: Book logic v2 - simplified 4 categories
from book_logic_v2 import (
    classifica_libri_studente,
    calcola_classe_precedente
)

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
    iban: Optional[str] = None  # IBAN per ricevere pagamenti
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
    iban: Optional[str] = None  # IBAN per ricevere pagamenti
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
    # NEW: condition details from sell.tsx (percentages)
    condition_details: Optional[dict] = None  # {penna, matita, evidenziatore, usura_libro, esercizi_penna, esercizi_matita}
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
    # Sistema credito cartolibreria
    credito_commissioni: float = 0.0  # Credito da commissioni libro
    credito_foderazione: float = 0.0  # Credito da foderazione
    credito_totale: float = 0.0  # Totale credito disponibile

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

# Stati dell'ordine - FLUSSO COMPLETO RIBOOK
ORDER_STATES = {
    # Fase 1: Richiesta
    "in_attesa_conferma_venditore": "In attesa conferma venditore",
    "annullato_non_disponibile": "Annullato - Non disponibile",
    "annullato_timeout": "Annullato - Timeout 24h",
    
    # Fase 2: Pagamento
    "in_attesa_pagamento": "In attesa di pagamento",
    
    # Fase 3: Consegna venditore
    "pagato_attesa_consegna": "Pagato - In attesa consegna",
    "annullato_mancata_consegna": "Annullato - Mancata consegna",
    
    # Fase 4: Verifica cartolibreria
    "rifiutato_condizioni": "Rifiutato - Condizioni non conformi",
    "pronto_per_ritiro": "Pronto per il ritiro",
    
    # Fase 5: Ritiro e completamento
    "picked_up": "Ritirato (periodo verifica 3gg)",
    "completed": "Completato",
    
    # Stati reso
    "in_verifica_reso": "Reso in verifica",
    "reso_accettato": "Reso accettato - Rimborsato",
    "reso_rifiutato": "Reso rifiutato",
    
    # Altri stati
    "cancelled": "Annullato",
    "refunded": "Rimborsato"
}

# Timer automatici
SELLER_CONFIRMATION_HOURS = 24  # 24h per conferma venditore
DELIVERY_BUSINESS_DAYS = 2      # 2 giorni lavorativi per consegna
RETURN_WINDOW_HOURS = 72        # 72 ore (3 giorni) per reso

# Costanti commissioni - NUOVA LOGICA
COSTO_FODERAZIONE = 1.50  # €1,50 per foderazione
COMMISSIONE_VENDITA_PERCENT = 0.20  # 20% commissione sulla vendita
QUOTA_VENDITORE_PERCENT = 0.80  # 80% al venditore
STRIPE_FEE_PERCENT = 0.029  # 2.9% Stripe
STRIPE_FEE_FIXED = 0.25  # €0.25 fisso Stripe

def calcola_commissioni(prezzo_libro: float, include_foderazione: bool = False):
    """
    NUOVA LOGICA COMMISSIONI RIBOOK
    
    - Prezzo Acquirente: prezzo_libro + foderazione (opzionale)
    - Venditore riceve: 80% del prezzo libro
    - Commissione 20%: divisa 50/50 tra piattaforma e cartolibreria
    - Fee Stripe sul libro: divisa 50/50 tra piattaforma e cartolibreria
    - Foderazione (€1,50): 100% alla cartolibreria, meno la fee Stripe extra generata
    
    Returns dict con:
    - totale_acquirente: quanto paga l'acquirente
    - netto_venditore: quanto riceve il venditore (80% prezzo libro)
    - commissione_stripe: costo Stripe totale
    - commissione_piattaforma: guadagno piattaforma (10% - 50% Stripe libro)
    - commissione_cartolibreria_libro: guadagno cartolibreria da libro (10% - 50% Stripe libro)
    - commissione_cartolibreria_foderazione: guadagno cartolibreria da foderazione (€1,50 - extra Stripe foderazione)
    - commissione_cartolibreria_totale: totale cartolibreria
    """
    costo_foderazione = COSTO_FODERAZIONE if include_foderazione else 0
    
    # Totale che paga l'acquirente (NO commissione aggiuntiva, prezzo = prezzo finale)
    totale_acquirente = prezzo_libro + costo_foderazione
    
    # Venditore riceve 80% del prezzo libro
    netto_venditore = prezzo_libro * QUOTA_VENDITORE_PERCENT
    
    # Commissione 20% sul libro (da dividere 50/50)
    commissione_totale = prezzo_libro * COMMISSIONE_VENDITA_PERCENT
    
    # Calcolo fee Stripe SENZA foderazione (sul prezzo libro)
    stripe_senza_foderazione = (prezzo_libro * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED
    
    # Calcolo fee Stripe CON foderazione (sul totale)
    stripe_con_foderazione = (totale_acquirente * STRIPE_FEE_PERCENT) + STRIPE_FEE_FIXED
    
    # Fee Stripe effettiva = quella CON foderazione se presente, altrimenti quella sul libro
    commissione_stripe = stripe_con_foderazione if include_foderazione else stripe_senza_foderazione
    
    # Extra Stripe generato dalla foderazione (da sottrarre alla quota foderazione)
    extra_stripe_foderazione = stripe_con_foderazione - stripe_senza_foderazione if include_foderazione else 0
    
    # Fee Stripe relativa al libro (senza foderazione) - divisa 50/50
    stripe_libro_per_parte = stripe_senza_foderazione / 2
    
    # Commissione divisa 50/50 tra piattaforma e cartolibreria
    commissione_piattaforma = (commissione_totale / 2) - stripe_libro_per_parte
    commissione_cartolibreria_libro = (commissione_totale / 2) - stripe_libro_per_parte
    
    # Foderazione: 100% alla cartolibreria MENO extra Stripe generato dalla foderazione
    commissione_cartolibreria_foderazione = costo_foderazione - extra_stripe_foderazione if include_foderazione else 0
    
    # Totale cartolibreria
    commissione_cartolibreria_totale = commissione_cartolibreria_libro + commissione_cartolibreria_foderazione
    
    return {
        "totale_acquirente": round(totale_acquirente, 2),
        "netto_venditore": round(netto_venditore, 2),
        "commissione_stripe": round(commissione_stripe, 2),
        "commissione_piattaforma": round(max(0, commissione_piattaforma), 2),
        "commissione_cartolibreria_libro": round(max(0, commissione_cartolibreria_libro), 2),
        "commissione_cartolibreria_foderazione": round(max(0, commissione_cartolibreria_foderazione), 2),
        "commissione_cartolibreria_totale": round(max(0, commissione_cartolibreria_totale), 2),
        "include_foderazione": include_foderazione,
        "costo_foderazione": costo_foderazione,
        "extra_stripe_foderazione": round(extra_stripe_foderazione, 2),
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
    book_condizioni: str = ""  # Condizioni dichiarate
    
    # Prezzi (in euro)
    prezzo_libro: float  # Prezzo del libro (va al venditore)
    commissione_app: float  # Commissione piattaforma
    commissione_cartolibreria: float  # Totale cartolibreria
    totale_acquirente: float  # Quello che paga l'acquirente
    netto_venditore: float  # Quello che riceve il venditore
    
    # Nuovi campi commissioni dettagliate
    include_foderazione: bool = False
    costo_foderazione: float = 0
    commissione_stripe: float = 0
    commissione_piattaforma: float = 0  # 10%/2 - stripe prop
    commissione_cartolibreria_libro: float = 0  # 10%/2 - stripe prop
    commissione_cartolibreria_foderazione: float = 0  # 1.50 - stripe prop
    condition_details: dict = Field(default_factory=dict)  # {penna, matita, evidenziatore, pagine}
    
    # Pagamento (simulato)
    payment_intent_id: Optional[str] = None
    payment_status: str = "pending"  # pending, paid, released, refunded
    
    # Stato ordine
    status: str = "in_attesa_conferma_venditore"  # Stato iniziale nuovo flusso
    status_history: List[dict] = Field(default_factory=list)
    
    # Date
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Timer 1: Conferma venditore (24h)
    seller_confirmation_deadline: Optional[datetime] = None
    seller_confirmed_at: Optional[datetime] = None
    
    # Timer 2: Consegna libro (2 giorni lavorativi)
    paid_at: Optional[datetime] = None
    delivery_deadline: Optional[datetime] = None
    delivered_to_bookstore_at: Optional[datetime] = None
    
    # Verifica cartolibreria
    bookstore_verified_at: Optional[datetime] = None
    bookstore_verification_notes: Optional[str] = None
    
    # Ritiro
    ready_for_pickup_at: Optional[datetime] = None
    picked_up_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Campi per il sistema di reso (3 giorni dal ritiro)
    return_deadline: Optional[datetime] = None
    return_requested_at: Optional[datetime] = None
    return_reason: Optional[str] = None
    return_verified_at: Optional[datetime] = None
    return_verified_by: Optional[str] = None
    return_notes: Optional[str] = None
    
    # Stripe Connect (per futuro)
    seller_stripe_account_id: Optional[str] = None

class CreateOrderRequest(BaseModel):
    listing_id: str
    bookstore_id: str
    include_foderazione: bool = False

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
    print(f"=== REGISTRATION ATTEMPT ===")
    print(f"Email: {user_data.email}")
    print(f"Nome: {user_data.nome}")
    print(f"Cognome: {user_data.cognome}")
    
    # Check if email already exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        print(f"Email già esistente!")
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    # Create user with auto-generated username
    user = User(
        nome=user_data.nome,
        cognome=user_data.cognome,
        email=user_data.email.lower(),
        telefono=user_data.telefono,
        password_hash=hash_password(user_data.password),
        iban=user_data.iban,
        scuola=user_data.scuola,
        classe=user_data.classe,
        sezione=user_data.sezione,
        tipo_scuola=user_data.tipo_scuola,
        username=generate_username()
    )
    
    await db.users.insert_one(user.dict())
    print(f"Utente creato con ID: {user.id}")
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

# ============== MIGRAZIONE PROFILI TEMPORANEI ==============

class TempProfile(BaseModel):
    id: str
    nome_figlio: str
    scuola: str
    codice_scuola: str
    classe: int
    sezione: str
    tipo_scuola: Optional[str] = "primo_grado"

class MigrateProfilesRequest(BaseModel):
    profiles: List[TempProfile]

@api_router.post("/auth/migrate-profiles/{user_id}")
async def migrate_temp_profiles(user_id: str, data: MigrateProfilesRequest):
    """
    Migra i profili temporanei (creati durante la navigazione anonima)
    all'account utente appena registrato.
    """
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    migrated_profiles = []
    existing_profiles = user.get("profili_figli", [])
    
    for temp_profile in data.profiles:
        # Verifica che non esista già un profilo con lo stesso nome e scuola
        duplicate = False
        for existing in existing_profiles:
            if (existing.get("nome_figlio", "").lower() == temp_profile.nome_figlio.lower() and
                existing.get("codice_scuola") == temp_profile.codice_scuola):
                duplicate = True
                break
        
        if duplicate:
            continue
        
        # Normalizza i dati
        try:
            classe_int = int(temp_profile.classe)
        except (ValueError, TypeError):
            classe_int = 1
        
        sezione_upper = temp_profile.sezione.upper() if temp_profile.sezione else ""
        
        # Crea nuovo profilo con nuovo ID
        new_profile = {
            "id": str(uuid.uuid4()),
            "nome_figlio": temp_profile.nome_figlio,
            "scuola": temp_profile.scuola,
            "codice_scuola": temp_profile.codice_scuola or "",
            "classe": classe_int,
            "sezione": sezione_upper,
            "tipo_scuola": temp_profile.tipo_scuola or "primo_grado",
            "classe_2025_2026": None,
            "fine_ciclo": False
        }
        
        existing_profiles.append(new_profile)
        migrated_profiles.append(new_profile)
    
    # Salva i profili aggiornati
    if migrated_profiles:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"profili_figli": existing_profiles}}
        )
    
    return {
        "message": f"Migrati {len(migrated_profiles)} profili",
        "migrated_count": len(migrated_profiles),
        "profiles": migrated_profiles
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

# ============== GOOGLE OAUTH (Emergent Auth) ==============

from datetime import timezone

class GoogleAuthRequest(BaseModel):
    session_id: str

class GoogleAuthSessionRequest(BaseModel):
    session_token: str
    user_data: dict

@api_router.post("/auth/google/callback")
async def google_oauth_callback(data: GoogleAuthRequest):
    """
    Processa il session_id di Google OAuth da Emergent Auth.
    Verifica con Emergent, crea/aggiorna utente e restituisce session_token.
    """
    try:
        # Verifica session_id con Emergent Auth
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": data.session_id}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=401, detail="Session ID non valido")
            
            google_data = response.json()
        
        # Estrai dati utente
        email = google_data.get("email", "").lower()
        name = google_data.get("name", "")
        picture = google_data.get("picture", "")
        session_token = google_data.get("session_token", "")
        
        if not email or not session_token:
            raise HTTPException(status_code=400, detail="Dati Google incompleti")
        
        # Cerca utente esistente per email
        existing_user = await db.users.find_one({"email": email})
        
        if existing_user:
            # Aggiorna dati Google se necessario
            user_id = existing_user["id"]
            username = existing_user["username"]
            update_data = {
                "google_picture": picture,
                "google_auth": True,
                "last_login": datetime.now(timezone.utc).isoformat()
            }
            if not existing_user.get("nome") and name:
                # Estrai nome e cognome dal nome completo
                name_parts = name.split(" ", 1)
                update_data["nome"] = name_parts[0]
                if len(name_parts) > 1:
                    update_data["cognome"] = name_parts[1]
            
            await db.users.update_one({"id": user_id}, {"$set": update_data})
        else:
            # Crea nuovo utente
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            name_parts = name.split(" ", 1)
            new_user = {
                "id": user_id,
                "username": email.split("@")[0],
                "email": email,
                "nome": name_parts[0] if name_parts else "",
                "cognome": name_parts[1] if len(name_parts) > 1 else "",
                "password_hash": "",  # Nessuna password per OAuth
                "google_auth": True,
                "google_picture": picture,
                "iban": "",
                "is_premium": False,
                "is_admin": False,
                "profili_figli": [],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "last_login": datetime.now(timezone.utc).isoformat()
            }
            await db.users.insert_one(new_user)
            username = new_user["username"]
        
        # Salva sessione
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        session_doc = {
            "id": str(uuid.uuid4()),
            "session_token": session_token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": expires_at.isoformat()
        }
        
        # Rimuovi sessioni precedenti per questo utente
        await db.user_sessions.delete_many({"user_id": user_id})
        await db.user_sessions.insert_one(session_doc)
        
        # Recupera dati utente completi
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
        
        return {
            "success": True,
            "session_token": session_token,
            "user_id": user_id,
            "username": username,
            "nome": user.get("nome", ""),
            "email": email,
            "picture": picture,
            "is_premium": user.get("is_premium", False),
            "profili_figli": user.get("profili_figli", [])
        }
        
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Errore comunicazione Emergent Auth: {str(e)}")

@api_router.get("/auth/me")
async def get_current_user(authorization: str = None):
    """
    Verifica sessione e ritorna dati utente.
    Header: Authorization: Bearer {session_token}
    """
    if not authorization:
        # Prova a leggere dall'header manualmente
        raise HTTPException(status_code=401, detail="Token mancante")
    
    # Estrai token dal Bearer
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    
    if not token:
        raise HTTPException(status_code=401, detail="Token mancante")
    
    # Cerca sessione
    session = await db.user_sessions.find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Sessione non valida")
    
    # Verifica scadenza
    expires_at_str = session.get("expires_at", "")
    if expires_at_str:
        try:
            # Gestisci sia stringhe ISO che datetime naive
            if isinstance(expires_at_str, str):
                expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            else:
                expires_at = expires_at_str
            
            # Normalizza a timezone-aware
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            
            if datetime.now(timezone.utc) > expires_at:
                await db.user_sessions.delete_one({"session_token": token})
                raise HTTPException(status_code=401, detail="Sessione scaduta")
        except (ValueError, TypeError):
            pass  # Se c'è un errore nel parsing, continua
    
    # Recupera utente
    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    
    return {
        "user_id": user["id"],
        "username": user.get("username", ""),
        "nome": user.get("nome", ""),
        "email": user.get("email", ""),
        "picture": user.get("google_picture", ""),
        "is_premium": user.get("is_premium", False),
        "profili_figli": user.get("profili_figli", [])
    }

@api_router.post("/auth/logout")
async def logout_user(authorization: str = None):
    """Logout: elimina la sessione"""
    if not authorization:
        return {"success": True}
    
    if authorization.startswith("Bearer "):
        token = authorization[7:]
    else:
        token = authorization
    
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    
    return {"success": True, "message": "Logout effettuato"}

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
    iban: Optional[str] = None
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
    if update_data.iban is not None:
        update_fields["iban"] = update_data.iban
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
    # Nuovi campi per logica V2
    classe_2025_2026: Optional[str] = None  # Classe frequentata l'anno precedente (None se nuovo studente)
    fine_ciclo: Optional[bool] = False  # True se lo studente ha terminato il ciclo scolastico

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
    
    # Gestione classe 2025/2026 - converte in intero se presente
    classe_2025_2026_int = None
    if profile_data.classe_2025_2026:
        try:
            classe_2025_2026_int = int(profile_data.classe_2025_2026)
        except (ValueError, TypeError):
            classe_2025_2026_int = None
    
    new_profile = {
        "id": str(uuid.uuid4()),
        "nome_figlio": profile_data.nome_figlio,
        "scuola": profile_data.scuola,
        "codice_scuola": profile_data.codice_scuola or "",
        "classe": classe_int,  # Classe 2026/2027 - salvato come intero
        "sezione": sezione_upper,  # Sezione validata e maiuscola
        "tipo_scuola": profile_data.tipo_scuola,
        # Nuovi campi per logica V2
        "classe_2025_2026": classe_2025_2026_int,  # Classe anno precedente (None se nuovo studente 1° anno)
        "fine_ciclo": profile_data.fine_ciclo or False  # True se diplomato/fine ciclo
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
        # Normalizza il tipo per la query (media/superiore)
        tipo_lower = tipo.lower()
        if tipo_lower in ["media", "medie", "mm"]:
            query["tipo"] = "media"
        elif tipo_lower in ["superiore", "superiori", "nt"]:
            query["tipo"] = "superiore"
        else:
            query["tipo"] = tipo
    
    schools = await db.schools.find(query).to_list(None)
    
    # Format response - supporta sia vecchio che nuovo schema
    result = []
    for school in schools:
        codice = school.get("codice_meccanografico") or school.get("codice")
        result.append({
            "codice": codice,
            "nome": school.get("nome"),
            "tipo": school.get("tipo", "").capitalize(),
            "comune": school.get("comune", "CATANZARO"),
            "has_books_2026": school.get("has_books_2026", True),
            "anno_scolastico": school.get("anno_scolastico", "2026/2027")
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
        # Supporta sia stringa che intero per anno_corso
        match_stage["anno_corso"] = str(classe)
    
    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$anno_corso",
            "sezioni": {"$addToSet": "$sezione"}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    results = await db.adozioni.aggregate(pipeline).to_list(None)
    
    # Raccogli tutte le sezioni uniche ordinate
    all_sections = set()
    sections_by_class = {}
    
    for r in results:
        classe_num = r["_id"]
        if classe_num:  # Ignora None
            sections_by_class[str(classe_num)] = sorted(r["sezioni"])
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
async def search_books_generic(q: str = Query(..., min_length=3), limit: int = Query(30)):
    """
    Ricerca generica libri per titolo o ISBN nei libri delle scuole di Catanzaro.
    Restituisce anche info sulle copie disponibili.
    """
    # Cerca per ISBN esatto
    if q.isdigit() and len(q) >= 10:
        books = await db.adozioni.find(
            {"isbn": {"$regex": q, "$options": "i"}},
            {"_id": 0}
        ).limit(limit).to_list(limit)
    else:
        # Cerca per titolo - case insensitive, parole parziali
        search_words = q.strip().split()
        regex_pattern = ".*" + ".*".join(search_words) + ".*"
        
        books = await db.adozioni.find(
            {"titolo": {"$regex": regex_pattern, "$options": "i"}},
            {"_id": 0}
        ).limit(limit * 2).to_list(limit * 2)
    
    # Rimuovi duplicati per ISBN
    seen = set()
    unique_books = []
    for book in books:
        isbn = book.get("isbn", "")
        if isbn and isbn not in seen:
            seen.add(isbn)
            unique_books.append(book)
    
    # Per ogni libro, cerca copie disponibili
    enriched_books = []
    for book in unique_books[:limit]:
        isbn = book.get("isbn", "")
        
        # Conta copie in vendita
        listings_count = await db.listings.count_documents({
            "isbn": isbn,
            "status": "available"
        })
        
        # Trova prezzo minimo se ci sono copie
        prezzo_minimo = None
        if listings_count > 0:
            min_listing = await db.listings.find_one(
                {"isbn": isbn, "status": "available"},
                sort=[("prezzo_vendita", 1)]
            )
            if min_listing:
                prezzo_minimo = min_listing.get("prezzo_vendita")
        
        enriched_books.append({
            "id": book.get("id", book.get("isbn")),
            "isbn": isbn,
            "titolo": book.get("titolo"),
            "autori": book.get("autori"),
            "editore": book.get("editore"),
            "disciplina": book.get("disciplina"),
            "prezzo_copertina": book.get("prezzo_copertina"),
            "classe": book.get("classe"),
            "copie_disponibili": listings_count,
            "prezzo_minimo": prezzo_minimo,
            "da_comprare_nuovo": listings_count == 0
        })
    
    return {"books": enriched_books, "total": len(enriched_books)}

# ============== POPULAR BOOKS API ==============

@api_router.get("/books/popular")
async def get_popular_books(anno_scolastico: str = "2026/2027", limit: int = 12):
    """
    Restituisce i libri più presenti nelle liste di adozione per l'anno scolastico specificato.
    Predisposto per supportare anche 2026/2027 quando verrà inserito.
    """
    try:
        # Cerca nelle adozioni per contare gli ISBN più frequenti
        pipeline = [
            {"$unwind": "$libri"},
            {"$group": {
                "_id": "$libri.isbn",
                "titolo": {"$first": "$libri.titolo"},
                "count": {"$sum": 1}
            }},
            {"$match": {"_id": {"$ne": None, "$ne": ""}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        
        results = []
        async for doc in db.adozioni.aggregate(pipeline):
            if doc["_id"]:
                results.append({
                    "isbn": doc["_id"],
                    "titolo": doc.get("titolo", ""),
                    "count": doc["count"]
                })
        
        # Se non ci sono risultati dalle adozioni, cerca nei libri
        if not results:
            pipeline_books = [
                {"$match": {"isbn": {"$ne": None, "$ne": ""}}},
                {"$limit": limit}
            ]
            async for book in db.books.aggregate(pipeline_books):
                results.append({
                    "isbn": book.get("isbn", ""),
                    "titolo": book.get("titolo", ""),
                    "count": 1
                })
        
        return results
        
    except Exception as e:
        logging.error(f"Error fetching popular books: {e}")
        return []


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


# ============== IBS.IT SCRAPER FOR BOOK DATA ==============

def get_book_cover_url(isbn: str, size: str = "M") -> dict:
    """
    Get book cover URL, trying Open Library first (legal), then IBS as fallback.
    Size: S (small), M (medium), L (large)
    Returns dict with primary and fallback URLs.
    """
    clean_isbn = isbn.strip().replace("-", "").replace(" ", "")
    
    # Open Library is free and legal (Internet Archive project)
    open_library_url = f"https://covers.openlibrary.org/b/isbn/{clean_isbn}-{size}.jpg"
    
    # IBS.it as fallback (direct image linking)
    ibs_url = f"https://www.ibs.it/images/{clean_isbn}_0_0_0_536_0.jpg"
    
    return {
        "primary": open_library_url,
        "fallback": ibs_url,
        "open_library": open_library_url,
        "ibs": ibs_url
    }


@api_router.get("/books/lookup/{isbn}")
async def lookup_book_by_isbn(isbn: str):
    """
    Search for a book first in local database.
    For non-school books, returns cover URLs only (user enters data manually).
    """
    clean_isbn = isbn.strip().replace("-", "").replace(" ", "")
    
    # First try local database (school books)
    book = await db.books.find_one({"isbn": clean_isbn})
    if book:
        return {
            **Book(**book).dict(),
            "source": "database",
            "cover_url": get_book_cover_url(clean_isbn)["primary"],
            "cover_fallback": get_book_cover_url(clean_isbn)["fallback"]
        }
    
    # Also check adozioni collection
    adozione = await db.adozioni.find_one({"isbn": clean_isbn})
    if adozione:
        covers = get_book_cover_url(clean_isbn)
        return {
            "id": f"adozione-{clean_isbn}",
            "isbn": clean_isbn,
            "titolo": adozione.get("titolo", ""),
            "autori": adozione.get("autori", ""),
            "editore": adozione.get("editore", ""),
            "prezzo_copertina": adozione.get("prezzo", 0),
            "cover_url": covers["primary"],
            "cover_fallback": covers["fallback"],
            "source": "adozioni"
        }
    
    # For non-school books: return cover URLs only, user enters data manually
    covers = get_book_cover_url(clean_isbn)
    return {
        "id": f"manual-{clean_isbn}",
        "isbn": clean_isbn,
        "titolo": "",
        "autori": "",
        "editore": "",
        "prezzo_copertina": 0,
        "cover_url": covers["primary"],
        "cover_fallback": covers["fallback"],
        "source": "not_found"
    }


# ============== BOOK COVER API (IBS.it) ==============

@api_router.get("/books/cover/{isbn}")
async def get_book_cover(isbn: str):
    """
    Recupera la copertina del libro da IBS.it
    IBS.it usa un pattern URL diretto: https://www.ibs.it/images/{ISBN}_0_0_0_{SIZE}.jpg
    SIZE: 180_50 = piccola, 536_0 = grande
    """
    try:
        # Pulisci ISBN
        clean_isbn = isbn.strip().replace("-", "").replace(" ", "")
        
        # URL diretto IBS.it (formato grande)
        ibs_cover_url = f"https://www.ibs.it/images/{clean_isbn}_0_0_0_536_0.jpg"
        
        # Verifica che l'immagine esista
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.head(ibs_cover_url, follow_redirects=True)
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                if 'image' in content_type:
                    return {
                        "isbn": clean_isbn,
                        "cover_url": ibs_cover_url,
                        "source": "ibs.it"
                    }
        
        # Fallback: prova URL IBS.it alternativo
        ibs_alt_url = f"https://www.ibs.it/images/{clean_isbn}_0_0_0_180_50.jpg"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.head(ibs_alt_url, follow_redirects=True)
            if response.status_code == 200:
                return {
                    "isbn": clean_isbn,
                    "cover_url": ibs_alt_url,
                    "source": "ibs.it"
                }
        
        # Fallback finale: Open Library
        openlibrary_url = f"https://covers.openlibrary.org/b/isbn/{clean_isbn}-L.jpg"
        
        return {
            "isbn": clean_isbn,
            "cover_url": openlibrary_url,
            "source": "openlibrary",
            "fallback": True
        }
        
    except Exception as e:
        logging.error(f"Error fetching book cover for ISBN {isbn}: {e}")
        return {
            "isbn": isbn,
            "cover_url": None,
            "error": str(e)
        }

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
    
    # NEW SYSTEM: If condition_details provided directly (from sell.tsx with percentages)
    if listing_data.condition_details:
        condition_details = listing_data.condition_details
        # Calculate condition from percentages (same logic as frontend)
        penna = condition_details.get('penna', 0)
        matita = condition_details.get('matita', 0)
        evidenziatore = condition_details.get('evidenziatore', 0)
        usura_libro = condition_details.get('usura_libro', 0)
        esercizi_penna = condition_details.get('esercizi_penna', False)
        esercizi_matita = condition_details.get('esercizi_matita', False)
        
        # Calculate weighted average (75% Pagine, 25% Usura)
        condizioni_pagine_media = (penna * 0.50 + evidenziatore * 0.35 + matita * 0.15)
        avg_defects = (condizioni_pagine_media * 0.75 + usura_libro * 0.25)
        
        # Add penalty for exercises
        if esercizi_penna:
            avg_defects = min(100, avg_defects + 10)
        if esercizi_matita:
            avg_defects = min(100, avg_defects + 10)
        
        # Determine condition from percentage
        if avg_defects <= 30:
            condizione = "ottimo"
        elif avg_defects <= 60:
            condizione = "buono"
        elif avg_defects <= 80:
            condizione = "accettabile"
        else:
            condizione = "scarso"
    
    # OLD SYSTEM: If condition_answers provided, calculate condition automatically
    elif listing_data.condition_answers:
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

@api_router.put("/notifications/{notification_id}/mark-used")
async def mark_notification_used(notification_id: str):
    """Segna una notifica come usata (il pulsante non apparirà più)"""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"used": True, "read": True}}
    )
    return {"success": result.modified_count > 0}


@api_router.post("/notifications/process-expired")
async def process_expired_notifications():
    """
    Processa le notifiche di conferma scadute (dopo 24h senza risposta).
    - Segna la notifica come 'expired'
    - Rimuove l'item dal carrello
    - Invia notifica all'acquirente che il libro non è disponibile
    """
    from datetime import datetime
    
    now = datetime.utcnow()
    
    # Trova notifiche di conferma scadute (pending e oltre expires_at)
    expired_notifications = await db.notifications.find({
        "type": "confirmation_request",
        "status": "pending",
        "expires_at": {"$lt": now.isoformat()}
    }).to_list(100)
    
    processed_count = 0
    
    for notification in expired_notifications:
        try:
            notification_id = notification.get("id")
            data = notification.get("data", {})
            buyer_id = data.get("buyer_id")
            cart_item_id = data.get("cart_item_id")
            book_title = data.get("book_title", "Libro richiesto")
            
            # 1. Segna la notifica come scaduta
            await db.notifications.update_one(
                {"id": notification_id},
                {"$set": {"status": "expired", "read": True}}
            )
            
            # 2. Rimuovi/aggiorna l'item dal carrello
            if cart_item_id:
                await db.cart.update_one(
                    {"id": cart_item_id},
                    {"$set": {"stato": "scaduto", "status": "expired"}}
                )
            
            # 3. Invia notifica all'acquirente
            if buyer_id:
                buyer_notification = {
                    "id": str(uuid.uuid4()),
                    "user_id": buyer_id,
                    "type": "request_expired",
                    "title": "Richiesta scaduta",
                    "message": f"\"{book_title}\" non disponibile per mancata risposta",
                    "data": {
                        "original_notification_id": notification_id,
                        "book_title": book_title
                    },
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(buyer_notification)
            
            processed_count += 1
            
        except Exception as e:
            print(f"Errore processando notifica {notification.get('id')}: {e}")
            continue
    
    return {
        "processed": processed_count,
        "message": f"Processate {processed_count} notifiche scadute"
    }


@api_router.post("/orders/process-completed")
async def process_completed_orders():
    """
    Completa automaticamente gli ordini il cui periodo di reso è scaduto (3 giorni).
    - Cambia status da 'picked_up' a 'completed'
    - Accredita le commissioni alla cartolibreria
    - Accredita le commissioni alla piattaforma
    - Notifica il venditore del pagamento
    """
    from datetime import datetime
    
    now = datetime.utcnow()
    
    # Trova ordini con periodo reso scaduto
    orders_to_complete = await db.orders.find({
        "status": "picked_up",
        "return_deadline": {"$lt": now.isoformat()}
    }).to_list(100)
    
    # Prova anche con datetime stored as datetime
    orders_datetime = await db.orders.find({
        "status": "picked_up",
        "return_deadline": {"$lt": now, "$type": "date"}
    }).to_list(100)
    
    all_orders = orders_to_complete + orders_datetime
    seen_ids = set()
    processed_count = 0
    
    for order in all_orders:
        order_id = order.get("id")
        if order_id in seen_ids:
            continue
        seen_ids.add(order_id)
        
        try:
            # Verifica deadline
            return_deadline = order.get("return_deadline")
            if isinstance(return_deadline, str):
                return_deadline = datetime.fromisoformat(return_deadline.replace('Z', '+00:00').replace('+00:00', ''))
            
            if now < return_deadline:
                continue  # Non ancora scaduto
            
            # ============= COMPLETA L'ORDINE =============
            update_data = {
                "status": "completed",
                "completed_at": now,
                "auto_completed": True,
                "status_history": order.get("status_history", []) + [{
                    "status": "completed",
                    "timestamp": now.isoformat(),
                    "note": "Ordine completato automaticamente - Periodo reso scaduto"
                }]
            }
            
            await db.orders.update_one({"id": order_id}, {"$set": update_data})
            
            # ============= ACCREDITA CARTOLIBRERIA =============
            bookstore_id = order.get("bookstore_id")
            if bookstore_id:
                commissione_libro = order.get("commissione_cartolibreria_libro", 0)
                commissione_foderazione = order.get("commissione_cartolibreria_foderazione", 0)
                commissione_totale = order.get("commissione_cartolibreria", 0)
                
                await db.bookstores.update_one(
                    {"id": bookstore_id},
                    {
                        "$inc": {
                            "credito_commissioni": commissione_libro,
                            "credito_foderazione": commissione_foderazione,
                            "credito_totale": commissione_totale
                        }
                    }
                )
                
                # Log movimento credito cartolibreria
                credit_log = {
                    "id": str(uuid.uuid4()),
                    "bookstore_id": bookstore_id,
                    "order_id": order_id,
                    "order_code": order.get("order_code"),
                    "book_titolo": order.get("book_titolo"),
                    "type": "accredito",
                    "commissione_libro": commissione_libro,
                    "commissione_foderazione": commissione_foderazione,
                    "totale": commissione_totale,
                    "created_at": now.isoformat(),
                    "note": "Accredito automatico - Periodo reso scaduto"
                }
                await db.bookstore_credit_logs.insert_one(credit_log)
            
            # ============= ACCREDITA PIATTAFORMA =============
            commissione_piattaforma = order.get("commissione_piattaforma", 0)
            if commissione_piattaforma > 0:
                await db.platform_stats.update_one(
                    {"id": "main"},
                    {
                        "$inc": {
                            "credito_totale": commissione_piattaforma,
                            "ordini_completati": 1
                        }
                    },
                    upsert=True
                )
                
                # Log movimento credito piattaforma
                platform_log = {
                    "id": str(uuid.uuid4()),
                    "order_id": order_id,
                    "order_code": order.get("order_code"),
                    "type": "accredito",
                    "amount": commissione_piattaforma,
                    "created_at": now.isoformat(),
                    "note": "Commissione piattaforma - Accredito automatico"
                }
                await db.platform_credit_logs.insert_one(platform_log)
            
            # ============= NOTIFICA VENDITORE =============
            netto_venditore = order.get("netto_venditore", 0)
            notification_seller = {
                "id": str(uuid.uuid4()),
                "user_id": order.get("seller_id"),
                "type": "payment_released",
                "title": "Pagamento sbloccato!",
                "message": f"Il periodo di reso per:\n📚 {order.get('book_titolo')}\n\nè terminato.\n\n💰 €{netto_venditore:.2f} saranno trasferiti sul tuo conto entro 3-5 giorni lavorativi.",
                "order_id": order_id,
                "order_code": order.get("order_code"),
                "amount": netto_venditore,
                "read": False,
                "created_at": now.isoformat()
            }
            await db.notifications.insert_one(notification_seller)
            
            processed_count += 1
            print(f"✅ Ordine {order.get('order_code')} completato automaticamente")
            
        except Exception as e:
            print(f"❌ Errore completando ordine {order.get('order_code')}: {e}")
            continue
    
    return {
        "processed": processed_count,
        "message": f"Completati {processed_count} ordini con periodo reso scaduto"
    }


@api_router.get("/notifications/check-expired/{user_id}")
async def check_expired_for_user(user_id: str):
    """
    Controlla e processa le notifiche scadute per un utente specifico.
    Chiamato quando l'utente apre l'app per aggiornare lo stato.
    """
    from datetime import datetime
    
    now = datetime.utcnow()
    
    # Trova notifiche di conferma inviate a questo utente che sono scadute
    expired_seller_notifications = await db.notifications.find({
        "user_id": user_id,
        "type": "confirmation_request",
        "status": "pending",
        "expires_at": {"$lt": now.isoformat()}
    }).to_list(50)
    
    # Trova anche richieste fatte da questo utente che sono scadute
    expired_buyer_notifications = await db.notifications.find({
        "type": "confirmation_request",
        "status": "pending",
        "data.buyer_id": user_id,
        "expires_at": {"$lt": now.isoformat()}
    }).to_list(50)
    
    processed = 0
    
    # Processa le notifiche scadute
    all_expired = expired_seller_notifications + expired_buyer_notifications
    seen_ids = set()
    
    for notification in all_expired:
        notification_id = notification.get("id")
        if notification_id in seen_ids:
            continue
        seen_ids.add(notification_id)
        
        data = notification.get("data", {})
        buyer_id = data.get("buyer_id")
        cart_item_id = data.get("cart_item_id")
        book_title = data.get("book_title", "Libro richiesto")
        
        # Segna come scaduta
        await db.notifications.update_one(
            {"id": notification_id},
            {"$set": {"status": "expired", "read": True}}
        )
        
        # Aggiorna carrello
        if cart_item_id:
            await db.cart.update_one(
                {"id": cart_item_id},
                {"$set": {"stato": "scaduto", "status": "expired"}}
            )
        
        # Notifica acquirente (se non è già stato notificato)
        if buyer_id:
            existing = await db.notifications.find_one({
                "type": "request_expired",
                "data.original_notification_id": notification_id
            })
            
            if not existing:
                buyer_notification = {
                    "id": str(uuid.uuid4()),
                    "user_id": buyer_id,
                    "type": "request_expired",
                    "title": "Richiesta scaduta",
                    "message": f"\"{book_title}\" non disponibile per mancata risposta",
                    "data": {
                        "original_notification_id": notification_id,
                        "book_title": book_title
                    },
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(buyer_notification)
        
        processed += 1
    
    return {"processed": processed}

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
    
    # Se manca prezzo_copertina, cercalo nelle adozioni
    if not listing.get("prezzo_copertina") and not listing.get("book_prezzo"):
        isbn = listing.get("book_isbn") or listing.get("isbn")
        if isbn:
            adozione = await db.adozioni.find_one({"isbn": isbn})
            if adozione:
                prezzo = adozione.get("prezzo") or adozione.get("prezzo_copertina")
                if prezzo:
                    listing["prezzo_copertina"] = prezzo
                    listing["book_prezzo"] = prezzo
    
    # Generate anonymous seller code
    seller_id = listing.get("seller_id", "")
    seller = await db.users.find_one({"id": seller_id})
    if seller:
        seller_username = seller.get("username")
        if not seller_username or seller_username == "Utente":
            code_part = seller_id.split("-")[-1][:5].upper()
            listing["seller_username"] = f"Utente_{code_part}"
        else:
            listing["seller_username"] = seller_username
    else:
        # Generate anonymous code from seller_id
        code_part = seller_id.split("-")[-1][:5].upper() if seller_id else "XXXXX"
        listing["seller_username"] = f"Utente_{code_part}"
    
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
    # Find listings for this ISBN - cerca sia 'stato' che 'status' per compatibilità
    query = {
        "book_isbn": isbn,
        "$or": [
            {"stato": "disponibile"},
            {"status": "available"}
        ]
    }
    
    projection = {"foto_base64": 0}
    listings = await db.listings.find(query, projection).sort("prezzo_vendita", 1).to_list(50)
    
    # Enrich with seller info
    for listing in listings:
        listing.pop('_id', None)
        seller = await db.users.find_one({"id": listing.get("seller_id")})
        if seller:
            # Use the user's anonymous code (username)
            listing["seller_username"] = seller.get("username", "Utente")
        else:
            # Generate anonymous code from seller_id (first 5 chars after last dash, uppercased)
            seller_id = listing.get("seller_id", "")
            if seller_id:
                code_part = seller_id.split("-")[-1][:5].upper()
                listing["seller_username"] = f"Utente_{code_part}"
            else:
                listing["seller_username"] = "Venditore"
    
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
async def delete_listing(listing_id: str, user_id: str = Query(...)):
    listing = await db.listings.find_one({"id": listing_id, "seller_id": user_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato")
    
    # Verifica stato - permetti eliminazione anche se riservato ma senza ordine attivo
    stato = listing.get("stato", "disponibile")
    if stato not in ["disponibile", "active"]:
        # Controlla se c'è un ordine attivo
        active_order = await db.orders.find_one({
            "listing_id": listing_id,
            "status": {"$nin": ["cancelled", "refunded", "rejected", "completed"]}
        })
        if active_order:
            raise HTTPException(status_code=400, detail="Non puoi eliminare un annuncio con ordine attivo")
    
    await db.listings.delete_one({"id": listing_id})
    return {"message": "Annuncio eliminato"}

@api_router.put("/listings/{listing_id}")
async def update_listing(listing_id: str, data: dict):
    """Aggiorna un listing esistente (condizioni, prezzo, foto, descrizione, fascicoli, bookstores)"""
    seller_id = data.get("seller_id")
    if not seller_id:
        raise HTTPException(status_code=400, detail="seller_id richiesto")
    
    listing = await db.listings.find_one({"id": listing_id, "seller_id": seller_id})
    if not listing:
        raise HTTPException(status_code=404, detail="Annuncio non trovato o non autorizzato")
    
    # Verifica che non ci siano ordini attivi
    if listing.get("stato") != "disponibile":
        raise HTTPException(status_code=400, detail="Non puoi modificare un annuncio con ordine attivo")
    
    if listing.get("order_id"):
        raise HTTPException(status_code=400, detail="Non puoi modificare un annuncio con ordine in corso")
    
    # Prepara i campi da aggiornare
    update_fields = {}
    
    if "condizioni" in data:
        update_fields["condizioni"] = data["condizioni"]
    
    if "descrizione" in data:
        update_fields["descrizione"] = data["descrizione"]
    
    if "note" in data:
        update_fields["note"] = data["note"]
    
    if "prezzo_vendita" in data:
        new_price = float(data["prezzo_vendita"])
        if new_price <= 0:
            raise HTTPException(status_code=400, detail="Il prezzo deve essere maggiore di 0")
        update_fields["prezzo_vendita"] = new_price
    
    if "foto_base64" in data and data["foto_base64"]:
        update_fields["foto_base64"] = data["foto_base64"]
    
    if "condition_details" in data and data["condition_details"]:
        update_fields["condition_details"] = data["condition_details"]
    
    # Nuovi campi: condition_answers (stesso formato della creazione)
    if "condition_answers" in data:
        update_fields["condition_answers"] = data["condition_answers"]
    
    # Fascicoli
    if "ha_fascicoli" in data:
        update_fields["ha_fascicoli"] = data["ha_fascicoli"]
    
    if "fascicoli_totali" in data:
        update_fields["fascicoli_totali"] = data["fascicoli_totali"]
    
    if "fascicoli_presenti" in data:
        update_fields["fascicoli_presenti"] = data["fascicoli_presenti"]
    
    # Bookstores - aggiorna anche i nomi
    if "bookstore_ids" in data:
        bookstore_ids = data["bookstore_ids"]
        update_fields["bookstore_ids"] = bookstore_ids
        
        # Recupera i nomi delle cartolibrerie
        bookstore_names = []
        for bs_id in bookstore_ids:
            bs = await db.bookstores.find_one({"id": bs_id})
            if bs:
                bookstore_names.append(bs.get("nome", ""))
        update_fields["bookstore_names"] = bookstore_names
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Nessun campo da aggiornare")
    
    update_fields["updated_at"] = datetime.utcnow().isoformat()
    
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": update_fields}
    )
    
    return {"message": "Annuncio aggiornato con successo", "updated_fields": list(update_fields.keys())}

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
        
        # Determine cycle limits - NUOVA LOGICA (scambi tra cicli permessi)
        if tipo == "primo_grado":
            cycle_max = 3  # Medie: 1-2-3
        else:
            # Superiori: scambi tra TUTTI i 5 anni (nessuna restrizione biennio/triennio)
            cycle_max = 5
        
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
                        "prezzo_copertina": libro.get("prezzo") or libro.get("prezzo_copertina", 0),
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
    
    # === GESTIONE CICLI SCOLASTICI - NUOVA LOGICA ===
    # Scuola media (primo grado): ciclo unico 1-2-3
    # Scuola superiore (secondo grado): SCAMBI ANCHE TRA CICLI (biennio ↔ triennio)
    #   - Es: 3° può vendere a 2°
    
    def get_cycle_info(classe: int, tipo_scuola: str):
        """
        Restituisce info sul ciclo: (classe_min, classe_max, nome_ciclo)
        NOTA: Per superiori ora permettiamo scambi tra cicli, quindi usiamo 1-5 come range
        """
        if tipo_scuola == "primo_grado":
            # Scuola media: ciclo unico 1-2-3
            return (1, 3, "media")
        else:
            # Scuola superiore: SCAMBI TRA TUTTI I 5 ANNI (nessuna restrizione biennio/triennio)
            return (1, 5, "superiore")
    
    cycle_min, cycle_max, cycle_name = get_cycle_info(user_classe, user_tipo)
    
    # Classi adiacenti (ora senza restrizione cicli per superiori)
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
                    "is_volume_unico": b.get("is_volume_unico", False) or b.get("volume", "").upper() == "U",
                    "nuova_adozione": b.get("nuova_adozione", False),
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
            "libri": vendibili  # Solo libri vendibili nel radar
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
    
    # Gestione cicli scolastici - NUOVA LOGICA (scambi tra cicli permessi)
    def get_cycle_info(classe: int, tipo_scuola: str):
        """Restituisce (min_classe, max_classe, nome_ciclo)
        Per superiori: SCAMBI TRA TUTTI I 5 ANNI (nessuna restrizione biennio/triennio)
        """
        if tipo_scuola == "primo_grado":
            return (1, 3, "media")
        else:
            # Superiori: scambi tra tutti i 5 anni
            return (1, 5, "superiore")
    
    cycle_min, cycle_max, cycle_name = get_cycle_info(child_classe, child_tipo)
    # Per vendibili: lo studente può vendere i libri dell'anno precedente
    # Anche tra cicli (es. 3° superiore può vendere al 2°)
    classe_precedente = child_classe - 1 if child_classe > 1 else None
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
    # FUNZIONE HELPER: VERIFICA SE VOLUME UNICO È VENDIBILE USATO
    # ========================================
    
    async def is_volume_unico_vendibile_usato(libro: dict, codice_scuola: str, disciplina: str, tipo_scuola: str, classe_corrente: int = 1) -> bool:
        """
        NUOVA LOGICA SEMPLIFICATA per verificare se un VOLUME UNICO può essere comprato USATO.
        
        SCUOLE MEDIE (primo_grado):
        - Volume unico comprato in 1ª → si usa fino a 3ª → NON VENDIBILE
        - ECCEZIONE: Se il libro era adottato l'anno precedente in 3ª ed è riproposto in 1ª
          → Chi ha finito la 3ª (e va in 1° superiore) PUÒ VENDERLO
        
        SCUOLE SUPERIORI (secondo_grado):
        - SOLO RELIGIONE rimane come materia fissa
        - Tutte le altre materie: verifico se il libro è presente nella lista di quella classe
        - Gli scambi avvengono ANCHE TRA CICLI (biennio ↔ triennio)
        
        REGOLE COMUNI:
        - Se nuova_adozione=True → NON disponibile usato
        - Gli scambi possono avvenire TRA SCUOLE DIVERSE (verifico se stesso ISBN)
        """
        import re
        
        # Se il libro ha nuova_adozione=True, NON può essere comprato usato
        if libro.get('nuova_adozione', False):
            return False
        
        isbn = libro.get('isbn', '')
        titolo = libro.get('titolo', '').upper()
        editore = libro.get('editore', '').upper()[:15]
        
        # ===========================================
        # SCUOLE MEDIE (primo_grado) - Volumi unici
        # ===========================================
        if tipo_scuola == "primo_grado":
            # REGOLA: Volume unico in 1ª si usa fino a 3ª → NON vendibile di default
            # ECCEZIONE: Se era adottato l'anno precedente in 3ª ed ora è in 1ª
            # → Chi finisce 3ª può venderlo
            
            # Cerco se questo libro era in 3ª l'anno scorso (collezione adozioni_storico o stesso anno)
            # Per ora verifico se è presente in 3ª attualmente E in 1ª
            # Se sì, chi ha completato la 3ª può venderlo ai nuovi di 1ª
            
            presente_in_terza = False
            presente_in_prima = False
            
            # Verifica in 3ª
            adoz_terza = await db.adozioni.find_one({
                'codice_scuola': codice_scuola,
                'classe': 3
            })
            if adoz_terza:
                for l in adoz_terza.get('libri', []):
                    if l.get('isbn') == isbn or (titolo[:15] in l.get('titolo', '').upper()[:20] and editore == l.get('editore', '').upper()[:15]):
                        if l.get('is_volume_unico', False):
                            presente_in_terza = True
                            break
            
            # Verifica in 1ª
            adoz_prima = await db.adozioni.find_one({
                'codice_scuola': codice_scuola,
                'classe': 1
            })
            if adoz_prima:
                for l in adoz_prima.get('libri', []):
                    if l.get('isbn') == isbn or (titolo[:15] in l.get('titolo', '').upper()[:20] and editore == l.get('editore', '').upper()[:15]):
                        if l.get('is_volume_unico', False):
                            presente_in_prima = True
                            break
            
            # ECCEZIONE: Se presente sia in 1ª che in 3ª → chi finisce 3ª può vendere
            if presente_in_terza and presente_in_prima:
                return True
            
            # Altrimenti NON vendibile (si usa per tutto il ciclo)
            return False
        
        # ===========================================
        # SCUOLE SUPERIORI (secondo_grado)
        # ===========================================
        else:
            disciplina_upper = disciplina.upper()
            
            # SOLO RELIGIONE rimane come materia fissa 5 anni
            MATERIE_FISSE = ['RELIGIONE', 'IRC', 'RELIGIONE CATTOLICA']
            is_religione = any(mat in disciplina_upper for mat in MATERIE_FISSE)
            
            if is_religione:
                # Religione: libro fisso per 5 anni
                # Vendibile solo se chi ha completato i 5 anni lo vende
                # Verifico se è lo stesso libro in tutte le classi
                stesso_ovunque = True
                for classe in range(1, 6):
                    if classe == classe_corrente:
                        continue
                    adoz = await db.adozioni.find_one({
                        'codice_scuola': codice_scuola,
                        'classe': classe
                    })
                    if not adoz:
                        continue
                    
                    trovato = False
                    for l in adoz.get('libri', []):
                        if any(mat in l.get('disciplina', '').upper() for mat in MATERIE_FISSE):
                            if l.get('isbn') == isbn:
                                trovato = True
                                if l.get('nuova_adozione', False):
                                    return False  # Nuova adozione in qualche classe
                                break
                    
                    if not trovato:
                        stesso_ovunque = False
                
                return stesso_ovunque
            
            else:
                # ALTRE MATERIE: Verifico semplicemente se il libro è presente nella lista
                # Se c'è chi lo ha usato (classe precedente), può venderlo
                # GLI SCAMBI AVVENGONO ANCHE TRA CICLI (es. 3° vende a 2°)
                
                # Verifico se esiste in una classe precedente (qualcuno che può venderlo)
                for classe_prec in range(1, classe_corrente):
                    adoz = await db.adozioni.find_one({
                        'codice_scuola': codice_scuola,
                        'classe': classe_prec
                    })
                    if not adoz:
                        continue
                    
                    for l in adoz.get('libri', []):
                        if l.get('isbn') == isbn:
                            if not l.get('nuova_adozione', False):
                                return True  # Qualcuno in una classe precedente può venderlo
                
                # Verifico anche in ALTRE SCUOLE (scambi tra scuole diverse)
                altre_adozioni = await db.adozioni.find({
                    'codice_scuola': {'$ne': codice_scuola},
                    'libri.isbn': isbn
                }).to_list(50)
                
                for adoz in altre_adozioni:
                    for l in adoz.get('libri', []):
                        if l.get('isbn') == isbn and not l.get('nuova_adozione', False):
                            return True  # Disponibile in un'altra scuola
                
                return False
    
    # ========================================
    # FUNZIONE HELPER: VERIFICA POTENZIALE USATO (legacy - mantenuta per compatibilità)
    # ========================================
    async def is_potentially_available_used(isbn: str, current_class: int, tipo_scuola: str, titolo: str = "", disciplina: str = "", codice_scuola: str = "") -> bool:
        """
        NUOVA LOGICA: Verifica se un libro ANNUALE è potenzialmente disponibile usato.
        
        REGOLE AGGIORNATE:
        - MEDIE: ciclo unico 1-2-3 (es. 2° vende a 1°, 3° vende a 2°)
        - SUPERIORI: scambi ANCHE TRA CICLI (es. 3° vende a 2°)
        - Scambi TRA SCUOLE DIVERSE: se stesso ISBN è in altre scuole → disponibile
        
        Per libri annuali (vol. 1, 2, 3), cerca se la STESSA SERIE è adottata in classi superiori.
        """
        if not isbn and not titolo:
            return False
        
        # Classi che possono VENDERE a chi sta in current_class
        # = tutte le classi superiori (senza restrizione biennio/triennio)
        if tipo_scuola == "primo_grado":
            # Medie: ciclo unico 1-2-3
            classi_venditrici = [c for c in [2, 3] if c > current_class]
        else:
            # Superiori: TUTTE le classi superiori (senza restrizione cicli)
            classi_venditrici = [c for c in [2, 3, 4, 5] if c > current_class]
        
        if not classi_venditrici:
            return False
        
        # Prima cerca per ISBN esatto (in TUTTE le scuole - scambi tra scuole diverse)
        count = await db.adozioni.count_documents({
            "classe": {"$in": classi_venditrici},
            "libri.isbn": isbn
        })
        
        if count > 0:
            return True
        
        # Se non trova per ISBN, cerca per SERIE (stesso titolo base + stessa disciplina)
        if titolo and disciplina:
            import re
            titolo_base = titolo.upper()
            titolo_base = re.sub(r'\s*\([^)]*\)', '', titolo_base)
            titolo_base = re.sub(r'\s+(VOL\.?\s*)?[123](\s|$)', ' ', titolo_base)
            titolo_base = re.sub(r'\s+VOLUME\s+[123]', ' ', titolo_base)
            titolo_base = re.sub(r'\s+[123]°?\s+(ANNO|VOL)', ' ', titolo_base)
            titolo_base = re.sub(r'\s+(ARITMETICA|GEOMETRIA|ALGEBRA)\s+[123]', r' \1', titolo_base)
            titolo_base = titolo_base.strip()
            
            if titolo_base:
                # Cerca in TUTTE le scuole (scambi tra scuole diverse)
                adozioni = await db.adozioni.find({
                    "classe": {"$in": classi_venditrici},
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
    # FUNZIONE HELPER: VERIFICA SE VOLUME UNICO È IN CLASSI SUPERIORI
    # ========================================
    async def is_same_book_in_higher_classes(libro: dict, codice_scuola: str, disciplina: str, tipo_scuola: str, classe_attuale: int) -> bool:
        """
        Verifica se un volume unico è adottato anche nelle classi superiori.
        Questo serve per determinare se il ciclo è "completato" (libro già passato per tutte le classi).
        
        Per le MEDIE: un volume unico del 1° anno si usa fino al 3° anno.
        Il ciclo è completato se siamo al 3° anno o se il libro è stato adottato da almeno 3 anni.
        
        Per le SUPERIORI: dipende dal tipo di volume (triennale biennio o triennale triennio).
        """
        isbn = libro.get("isbn")
        if not isbn:
            return False
        
        # Per classe 3 medie, il ciclo è sicuramente completato
        if tipo_scuola == "primo_grado" and classe_attuale >= 3:
            return True
        
        # Per classe 5 superiori, qualsiasi ciclo è completato
        if tipo_scuola != "primo_grado" and classe_attuale >= 5:
            return True
        
        # Determina le classi superiori da controllare
        if tipo_scuola == "primo_grado":
            classi_superiori = [c for c in [2, 3] if c > classe_attuale]
        else:
            classi_superiori = [c for c in [2, 3, 4, 5] if c > classe_attuale]
        
        if not classi_superiori:
            return True  # Nessuna classe superiore = ciclo completato
        
        # Verifica se lo stesso ISBN è adottato in classi superiori della stessa scuola
        for classe_sup in classi_superiori:
            count = await db.adozioni.count_documents({
                "codice_scuola": codice_scuola,
                "anno_corso": str(classe_sup),
                "isbn": isbn
            })
            if count > 0:
                return False  # Il libro è ancora usato in classi superiori = ciclo NON completato
        
        # Se il libro non è più adottato in classi superiori, il ciclo è completato
        # (o il libro è stato cambiato per le classi successive)
        return True
    
    # ========================================
    # NUOVA LOGICA: USA COLLEZIONE ADOZIONI
    # ========================================
    
    async def get_books_from_adozioni(codice_scuola: str, classe: int, sezione: str, anno_scolastico: str = "2026/2027") -> list:
        """Recupera libri dalla collezione adozioni per una specifica combinazione.
        Se la sezione non esiste, usa la prima sezione disponibile (fallback).
        
        anno_scolastico: "2026/2027" (corrente) o "2026/2027" (storico)
        
        NOTA: Nella nuova struttura, ogni documento in 'adozioni' è un singolo libro.
        Il campo è 'anno_corso' (stringa) non 'classe' (intero).
        """
        # Scegli la collezione in base all'anno scolastico
        if anno_scolastico == "2025/2026":
            collection = db.adozioni_2025_2026
        elif anno_scolastico == "2024/2025":
            collection = db.adozioni_2024_2025
        else:
            # Default: collezione corrente 2026/2027
            collection = db.adozioni
        
        # Converte classe in stringa per il match
        classe_str = str(classe)
        
        # Prima prova con la sezione esatta
        libri = await collection.find({
            "codice_scuola": codice_scuola,
            "anno_corso": classe_str,
            "sezione": sezione.upper()
        }).to_list(None)
        
        if libri:
            # Trasforma ogni documento adozione nel formato libro atteso
            return [{
                "isbn": libro.get("isbn"),
                "titolo": libro.get("titolo"),
                "sottotitolo": libro.get("sottotitolo", ""),
                "autori": libro.get("autori"),
                "editore": libro.get("editore"),
                "disciplina": libro.get("disciplina"),
                "prezzo_copertina": libro.get("prezzo") or libro.get("prezzo_copertina", 0),
                "volume": libro.get("volume", ""),
                "is_volume_unico": libro.get("volume", "").upper() == "U",
                "da_acquistare": libro.get("da_acquistare", True),
                "consigliato": libro.get("consigliato", False),
                "nuova_adozione": libro.get("nuova_adozione", False),
            } for libro in libri]
        
        # FALLBACK: Se la sezione non esiste, usa qualsiasi sezione disponibile per quella classe
        libri_fallback = await collection.find({
            "codice_scuola": codice_scuola,
            "anno_corso": classe_str
        }).to_list(None)
        
        if libri_fallback:
            # Prendi solo la prima sezione trovata per evitare duplicati
            prima_sezione = libri_fallback[0].get("sezione") if libri_fallback else None
            if prima_sezione:
                libri_filtrati = [l for l in libri_fallback if l.get("sezione") == prima_sezione]
                return [{
                    "isbn": libro.get("isbn"),
                    "titolo": libro.get("titolo"),
                    "sottotitolo": libro.get("sottotitolo", ""),
                    "autori": libro.get("autori"),
                    "editore": libro.get("editore"),
                    "disciplina": libro.get("disciplina"),
                    "prezzo_copertina": libro.get("prezzo") or libro.get("prezzo_copertina", 0),
                    "volume": libro.get("volume", ""),
                    "is_volume_unico": libro.get("volume", "").upper() == "U",
                    "da_acquistare": libro.get("da_acquistare", True),
                    "consigliato": libro.get("consigliato", False),
                    "nuova_adozione": libro.get("nuova_adozione", False),
                } for libro in libri_filtrati]
        
        return []
    
    # ========================================
    # HELPER: IDENTIFICA LIBRI DI STRUMENTO MUSICALE
    # ========================================
    def is_libro_strumento_musicale(libro: dict) -> bool:
        """
        Identifica se un libro è di STRUMENTO musicale (da escludere dal calcolo).
        I libri di strumento hanno nel titolo riferimenti a strumenti specifici.
        Mantiene solo il libro di TESTO (es. "Prima la Musica").
        """
        titolo = libro.get("titolo", "").upper()
        disciplina = libro.get("disciplina", "").upper()
        
        # Solo per disciplina MUSICA
        if "MUSIC" not in disciplina:
            return False
        
        # Parole chiave che identificano libri di STRUMENTO (da escludere)
        strumenti_keywords = [
            "CHITARRA", "PIANOFORTE", "PIANO", "VIOLINO", "VIOLA", "VIOLONCELLO",
            "FLAUTO", "CLARINETTO", "SAXOFONO", "SASSOFONO", "TROMBA", "TROMBONE",
            "PERCUSSIONI", "BATTERIA", "TASTIERA", "FISARMONICA", "OBOE", "FAGOTTO",
            "METODO", "TECNICA FONDAMENTALE", "ANTOLOGIA PIANISTICA", "LEZIONI DI",
            "SCUOLA DEL", "SCUOLA DI", "METODO PER", "PRIME LEZIONI"
        ]
        
        for keyword in strumenti_keywords:
            if keyword in titolo:
                return True
        
        return False
    
    # ========================================
    # HELPER: VERIFICA GRAMMATICA/TECNOLOGIA USATO
    # ========================================
    async def can_buy_used_from_previous_year(libro: dict, codice_scuola: str, child_classe: int, tipo_scuola: str) -> tuple:
        """
        LOGICA SEMPLIFICATA per determinare se un libro può essere comprato USATO.
        
        Per le SCUOLE MEDIE:
        
        REGOLA UNICA: Un libro può essere comprato usato SOLO se era adottato 
        in classe 3ª nell'anno precedente (2025/2026).
        
        Motivazione: Solo chi ha FINITO le medie (era in 3ª l'anno scorso) può vendere 
        i propri libri. Chi è ancora alle medie (1ª o 2ª) ha bisogno dei libri.
        
        Esempi:
        - "Artemondo" adottato in 1ª, 2ª, 3ª → chi era in 3ª può venderlo → USATO OK ✅
        - "Infinito Tecnologico" adottato solo in 1ª, 2ª → nessuno può venderlo → SOLO NUOVO ❌
        
        Returns: (can_buy_used: bool, motivo: str)
        """
        isbn = libro.get("isbn", "")
        titolo = libro.get("titolo", "")
        
        if not isbn:
            return False, "ISBN mancante"
        
        if tipo_scuola == "primo_grado":  # Scuola Media
            # REGOLA UNICA: Il libro DEVE essere stato adottato in 3ª l'anno scorso
            # Solo chi ha finito le medie può vendere i propri libri
            
            found_in_3a = await db.books.find_one({
                "isbn": isbn,
                "classe": "3",
                "anno_scolastico": "2025/2026"
            })
            
            if found_in_3a:
                return True, "Presente in 3ª 2025/2026 - disponibile usato"
            
            # Fallback: cerca in altre scuole medie di Catanzaro
            found_in_3a_altre = await db.books.find_one({
                "isbn": isbn,
                "classe": "3",
                "codice_scuola": {"$regex": "^CZMM"},
                "anno_scolastico": "2025/2026"
            })
            
            if found_in_3a_altre:
                return True, "Presente in altre 3ª 2025/2026 - disponibile usato"
            
            # NON trovato in 3ª - nessuno può venderlo perché chi ce l'ha ne ha ancora bisogno
            return False, "Non adottato in 3ª 2025/2026 - nessun venditore disponibile"
        
        # Per SUPERIORI: logica esistente
        return True, "Superiori - logica standard"
    
    # Carica libri della MIA classe/sezione (anno corrente 2026/2027)
    all_my_books = await get_books_from_adozioni(child_codice_scuola, child_classe, child_sezione, "2026/2027")
    
    # Separa libri in categorie:
    # 1. Libri da acquistare obbligatori (da_acquistare=True) - NON volumi unici
    # 2. Libri consigliati o da non acquistare (da_acquistare=False o consigliato=True) - inclusi volumi unici
    # 3. Volumi unici obbligatori
    
    # Prima carica libri classe precedente per verificare continuità serie
    # IMPORTANTE: Usa i dati dell'anno scorso (2024/2025) per sapere cosa aveva lo studente
    all_libri_prec = []
    if classe_precedente:
        # Per i libri VENDIBILI: lo studente vende ciò che aveva l'anno scorso (2024/2025)
        # nella sua classe PRECEDENTE (es. era in 2ª l'anno scorso, ora è in 3ª)
        all_libri_prec = await get_books_from_adozioni(child_codice_scuola, classe_precedente, child_sezione, "2025/2026")
    
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
    libri_gia_posseduti = []  # NUOVA LISTA per volumi unici già comprati in anni precedenti
    
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
        # ========================================
        # FILTRO LIBRI DI STRUMENTO MUSICALE
        # ========================================
        # I libri di strumento (chitarra, pianoforte, flauto, etc.) NON vanno nel calcolo
        # ma rimangono nella lista PDF originale
        if is_libro_strumento_musicale(libro):
            # Marca il libro come "da non calcolare" ma lo tiene per il PDF
            libro["escluso_calcolo"] = True
            libro["motivo_esclusione"] = "Libro di strumento musicale - non incluso nel calcolo"
            my_books_consigliati.append(libro)  # Va nei consigliati (non obbligatori)
            continue
        
        if is_scuola_media:
            # SCUOLA MEDIA: i consigliati vanno trattati come obbligatori
            if is_prima_classe:
                # Prima media: TUTTI i libri vanno acquistati
                my_books.append(libro)
            else:
                # Seconda/terza media: solo libri ANNUALI (non volumi unici)
                if libro.get('is_volume_unico'):
                    # Volume unico in 2ª/3ª - GIÀ COMPRATO in 1ª
                    libri_gia_posseduti.append({
                        **libro,
                        "motivo_possesso": "Volume unico triennale comprato in 1ª media"
                    })
                elif libro.get('da_acquistare', True) == True or libro.get('consigliato') == True:
                    # Sia obbligatori che consigliati vanno in my_books
                    my_books.append(libro)
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
                    # Volume unico quinquennale - già comprato in 1ª, mostralo come posseduto
                    libri_gia_posseduti.append({
                        **libro,
                        "motivo_possesso": "Volume unico quinquennale comprato in 1ª"
                    })
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
                        libri_gia_posseduti.append({
                            **libro,
                            "motivo_possesso": "Volume unico quinquennale comprato in 1ª"
                        })
                    else:
                        # Volume unico NON quinquennale
                        if child_classe == 2:
                            # In 2ª - volume unico del biennio già comprato in 1ª
                            libri_gia_posseduti.append({
                                **libro,
                                "motivo_possesso": "Volume unico biennale comprato in 1ª"
                            })
                        else:
                            # In 4ª/5ª - volume unico del triennio già comprato in 3ª
                            libri_gia_posseduti.append({
                                **libro,
                                "motivo_possesso": "Volume unico triennale comprato in 3ª"
                            })
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
            volume = b.get("volume", "").upper().strip()
            
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
                    "volume": volume,
                    "is_volume_unico": volume == "U" or b.get("is_volume_unico", False),
                    "titolo_base": get_series_name(titolo),
                    "libri_multipli": [b],
                    "nuova_adozione": b.get("nuova_adozione", False),
                    "da_acquistare": b.get("da_acquistare", True),
                    "disciplina_originale": disc
                }
        return result
    
    my_books_disc = books_by_discipline(my_books)
    # Per i vendibili, usa TUTTI i libri della classe precedente (non solo annuali)
    prec_books_disc = books_by_discipline(all_libri_prec)
    succ_books_disc = books_by_discipline(libri_succ)
    
    # Calcola vendere - con ISBN
    # LOGICA VENDIBILI: i libri che lo studente ha usato l'anno scorso e può vendere
    # Un libro del 1° anno 2024/2025 è VENDIBILE se:
    # - Lo stesso ISBN è adottato per il 1° anno 2025/2026 (nuovi studenti)
    # Un libro NON è vendibile se:
    # - È un volume unico che serve ancora (es. triennale usato anche in 2ª e 3ª)
    # - L'edizione è cambiata (ISBN diverso adottato per i nuovi studenti)
    vendibili = []
    non_vendibili = []
    
    # =====================================================
    # CARICA LIBRI DELLA CLASSE PRECEDENTE (2025/2026)
    # Per i nuovi studenti di quella classe
    # =====================================================
    libri_nuovi_studenti = []
    if classe_precedente:
        libri_nuovi_studenti = await get_books_from_adozioni(child_codice_scuola, classe_precedente, child_sezione, "2026/2027")
    
    # Crea mappa ISBN -> libro per confronto veloce
    isbn_nuovi_studenti = {b.get('isbn'): b for b in libri_nuovi_studenti if b.get('isbn')}
    disc_nuovi_studenti = {}
    for b in libri_nuovi_studenti:
        disc = b.get('disciplina', '').upper()[:15]
        if disc:
            disc_nuovi_studenti[disc] = b
    
    # Carica TUTTI i libri della classe attuale per verificare volumi unici che servono ancora
    all_my_books_full = await get_books_from_adozioni(child_codice_scuola, child_classe, child_sezione, "2026/2027")
    isbn_my_books = {b.get('isbn'): b for b in all_my_books_full if b.get('isbn')}
    
    for key_prec, book_prec in prec_books_disc.items():  # Itera sui libri dell'anno scorso
        disc_prec = book_prec.get("disciplina_originale", "")
        is_volume_unico_prec = book_prec.get("is_volume_unico", False)
        isbn_prec = book_prec.get("isbn", "")
        titolo_prec = book_prec.get("titolo", "")
        
        # =====================================================
        # STEP 0: Se il libro aveva da_acquistare=False nell'anno precedente,
        # significa che è un VOLUME UNICO che lo studente già possedeva.
        # Serve ancora SOLO SE lo stesso ISBN è presente nella classe attuale.
        # =====================================================
        if not book_prec.get("da_acquistare", True):
            # Controlla se lo stesso ISBN esiste nella classe attuale
            if isbn_prec and isbn_prec in isbn_my_books:
                non_vendibili.append({
                    "disciplina": disc_prec,
                    "isbn": isbn_prec,
                    "titolo_vecchio": titolo_prec[:40],
                    "titolo_nuovo": "",
                    "status": "SERVE ANCORA",
                    "motivo": f"Volume unico usato anche in {child_classe}ª"
                })
                continue
            
            # Lo stesso ISBN NON è nella classe attuale, può essere venduto
            if isbn_prec and isbn_prec in isbn_nuovi_studenti:
                vendibili.append({
                    "isbn": isbn_prec,
                    "disciplina": disc_prec,
                    "titolo": titolo_prec[:50],
                    "editore": book_prec.get("editore", ""),
                    "prezzo_consigliato": round(book_prec.get("prezzo", 0) * 0.5, 2),
                    "status": "VENDIBILE",
                    "vendi_a": "Classi precedenti",
                    "motivo": "Volume unico non più necessario"
                })
            # Se non è più adottato, semplicemente lo ignoriamo
            continue
        
        # =====================================================
        # STEP 1: Verifica se è un volume unico che SERVE ANCORA
        # (stesso ISBN usato nella classe attuale)
        # =====================================================
        if isbn_prec and isbn_prec in isbn_my_books:
            # Lo stesso ISBN è adottato anche nella classe attuale → SERVE ANCORA
            non_vendibili.append({
                "disciplina": disc_prec,
                "isbn": isbn_prec,
                "titolo_vecchio": titolo_prec[:40],
                "titolo_nuovo": "",
                "status": "SERVE ANCORA",
                "motivo": f"Volume usato anche in {child_classe}ª"
            })
            continue
        
        # =====================================================
        # STEP 2: Verifica se il libro è VENDIBILE ai nuovi studenti
        # (stesso ISBN adottato per la classe precedente 2025/2026)
        # =====================================================
        if isbn_prec and isbn_prec in isbn_nuovi_studenti:
            # Lo stesso ISBN è adottato per i nuovi studenti → VENDIBILE!
            vendibili.append({
                "isbn": isbn_prec,
                "disciplina": disc_prec,
                "titolo": titolo_prec[:50],
                "editore": book_prec.get("editore", ""),
                "prezzo_consigliato": round(book_prec.get("prezzo", 0) * 0.5, 2),
                "status": "VENDIBILE",
                "vendi_a": "Classi precedenti",
                "motivo": "Libro ancora adottato per i nuovi studenti"
            })
            continue
        
        # =====================================================
        # STEP 3: Verifica se l'EDIZIONE è CAMBIATA
        # (stessa materia ma ISBN diverso per i nuovi studenti)
        # =====================================================
        disc_key = disc_prec.upper()[:15]
        libro_nuovi = disc_nuovi_studenti.get(disc_key)
        
        if libro_nuovi:
            # La materia esiste per i nuovi studenti ma con ISBN diverso → EDIZIONE CAMBIATA
            non_vendibili.append({
                "disciplina": disc_prec,
                "isbn": isbn_prec,
                "titolo_vecchio": titolo_prec[:40],
                "titolo_nuovo": libro_nuovi.get("titolo", "")[:40],
                "status": "EDIZIONE CAMBIATA",
                "motivo": "La scuola ha adottato una nuova edizione"
            })
        else:
            # La materia non esiste più per quella classe → NON PIÙ ADOTTATO
            non_vendibili.append({
                "disciplina": disc_prec,
                "isbn": isbn_prec,
                "titolo_vecchio": titolo_prec[:40],
                "titolo_nuovo": "",
                "status": "NON PIÙ ADOTTATO",
                "motivo": "La materia non è più adottata per quella classe"
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
        
        # =====================================================
        # LOGICA BASATA SU nuova_adozione + VOLUMI UNICI
        # =====================================================
        # - nuova_adozione=True → libro NON disponibile usato, solo NUOVO
        # - nuova_adozione=False + Volume Unico → verifica se ciclo completato
        # - nuova_adozione=False + Libro Annuale → potenzialmente USATO
        # =====================================================
        
        is_nuova_adozione = my_book.get("nuova_adozione", False)
        is_volume_unico = my_book.get("is_volume_unico", False) or my_book.get("libri_multipli", [{}])[0].get("is_volume_unico", False)
        
        # Verifica se è una nuova edizione dal titolo (backup)
        titolo_upper = my_book["titolo"].upper()
        is_nuova_edizione = "2025" in titolo_upper or "2026" in titolo_upper or "NUOVA EDIZIONE" in titolo_upper
        
        # Conta copie usate disponibili
        copie_disponibili = 0
        if isbn:
            copie_disponibili = await db.listings.count_documents({
                "book_isbn": isbn,
                "status": "available"
            })
        
        # REGOLA 1: Se nuova_adozione=True → NON disponibile usato
        if is_nuova_adozione or is_nuova_edizione:
            # Libro NUOVO - non può essere comprato usato
            if copie_disponibili > 0:
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE",
                    "nota": "Nuova adozione ma copie disponibili"
                })
            else:
                motivo = "Nuova adozione 2025/2026" if is_nuova_adozione else "Nuova edizione"
                comprare_nuovo.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"],
                    "editore": my_book["editore"],
                    "prezzo": my_book["prezzo"],
                    "copie_usate_disponibili": 0,
                    "is_nuova_edizione": is_nuova_edizione,
                    "is_nuova_adozione": is_nuova_adozione,
                    "is_volume_unico": is_volume_unico,
                    "motivo": motivo
                })
        
        # REGOLA 2: Volume Unico con nuova_adozione=False
        # NUOVA LOGICA: Verifica se era presente nelle 3ª dell'anno precedente
        elif is_volume_unico:
            # Usa la nuova funzione che confronta con l'anno precedente
            can_buy_used, motivo_usato = await can_buy_used_from_previous_year(
                my_book, child_codice_scuola, child_classe, child_tipo
            )
            
            if can_buy_used:
                # Volume unico disponibile usato (era nelle 3ª 2025/2026)
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE" if copie_disponibili > 0 else "CERCA USATO",
                    "is_volume_unico": True,
                    "motivo": motivo_usato
                })
            else:
                # Volume unico NON presente nell'anno precedente - da comprare nuovo
                comprare_nuovo.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"],
                    "editore": my_book["editore"],
                    "prezzo": my_book["prezzo"],
                    "copie_usate_disponibili": copie_disponibili,
                    "is_nuova_edizione": False,
                    "is_nuova_adozione": False,
                    "is_volume_unico": True,
                    "motivo": motivo_usato
                })
        
        # REGOLA 3: Libro Annuale con nuova_adozione=False → potenzialmente USATO
        # NUOVA LOGICA: Confronta con l'anno precedente per verificare disponibilità usato
        else:
            # Usa la stessa funzione che confronta con l'anno precedente
            can_buy_used, motivo_usato = await can_buy_used_from_previous_year(
                my_book, child_codice_scuola, child_classe, child_tipo
            )
            
            if can_buy_used:
                # Libro annuale confermato dall'anno precedente - disponibile usato
                comprare_usato.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"][:50],
                    "editore": my_book["editore"],
                    "prezzo_nuovo": my_book["prezzo"],
                    "prezzo_usato": round(my_book["prezzo"] * 0.5, 2),
                    "risparmio": round(my_book["prezzo"] * 0.5, 2),
                    "copie_disponibili": copie_disponibili,
                    "status": "USATO DISPONIBILE" if copie_disponibili > 0 else "CERCA USATO",
                    "motivo": motivo_usato
                })
            else:
                # Libro non presente nell'anno precedente - nuova adozione, da comprare nuovo
                comprare_nuovo.append({
                    "isbn": isbn,
                    "disciplina": disc,
                    "titolo": my_book["titolo"],
                    "editore": my_book["editore"],
                    "prezzo": my_book["prezzo"],
                    "copie_usate_disponibili": 0,
                    "is_nuova_edizione": False,
                    "is_nuova_adozione": True,
                    "is_volume_unico": False,
                    "motivo": motivo_usato
                })
    
    # Calcoli finali
    # FILTRA: nei non_vendibili mostra SOLO quelli che "SERVE ANCORA"
    # I libri con "EDIZIONE CAMBIATA" o "NON PIÙ ADOTTATO" non sono rilevanti
    non_vendibili_ancora_in_uso = [nv for nv in non_vendibili if nv.get("status") == "SERVE ANCORA"]
    
    # NOTA: I volumi unici di NUOVA ADOZIONE NON vanno in "ANCORA IN USO"
    # perché sono libri che lo studente deve ancora comprare.
    # Vanno mostrati solo nella sezione "NUOVI DA COMPRARE".
    # La sezione "ANCORA IN USO" contiene SOLO i libri che lo studente HA GIÀ.
    
    # AGGIUNGI: Volumi unici triennali della classe ATTUALE che lo studente ha già
    # (comprati in anni precedenti, ora li usa ancora)
    # Questi sono volumi unici che appaiono nella classe attuale ma NON sono da comprare
    # perché lo studente li ha già
    if child_classe > 1:
        # Per ogni volume unico della classe attuale che NON è nei libri da comprare
        isbn_da_comprare = set()
        for libro in comprare_nuovo:
            if libro.get('isbn'):
                isbn_da_comprare.add(libro.get('isbn'))
        for libro in comprare_usato:
            if libro.get('isbn'):
                isbn_da_comprare.add(libro.get('isbn'))
        
        # Controlla tutti i libri della classe attuale
        for libro in all_my_books:
            if libro.get('is_volume_unico'):
                isbn = libro.get('isbn', '')
                disc = libro.get('disciplina', '')
                
                # Se è un volume unico che NON è nei libri da comprare, lo studente lo ha già
                if isbn and isbn not in isbn_da_comprare:
                    # Verifica se non è già nella lista
                    gia_incluso = any(nv.get('isbn') == isbn for nv in non_vendibili_ancora_in_uso)
                    
                    if not gia_incluso:
                        # Determina quando è stato comprato in base al tipo di scuola
                        if child_tipo == "primo_grado":
                            # Medie: volumi unici comprati in 1ª
                            anno_acquisto = 1
                        else:
                            # Superiori: volumi unici quinquennali in 1ª, triennali in 3ª
                            # Verifica se è un volume quinquennale (Religione, Scienze Motorie, Ed. Civica)
                            disc_upper = disc.upper()
                            is_quinquennale = any(kw in disc_upper for kw in ['RELIGIONE', 'MOTORIE', 'CIVICA', 'GRAMMATICA'])
                            
                            if is_quinquennale:
                                anno_acquisto = 1  # Comprato in 1ª
                            elif child_classe >= 3:
                                anno_acquisto = 3  # Comprato in 3ª (triennio)
                            else:
                                anno_acquisto = 1  # Comprato in 1ª (biennio)
                        
                        non_vendibili_ancora_in_uso.append({
                            "disciplina": disc,
                            "isbn": isbn,
                            "titolo_vecchio": libro.get('titolo', '')[:40],
                            "titolo_nuovo": "",
                            "status": f"COMPRATO IN {anno_acquisto}ª",
                            "motivo": f"Volume unico comprato in {anno_acquisto}ª - lo usi ancora"
                        })
    
    # =====================================================
    # AGGIUNGI LIBRI VENDIBILI: Libri comprati in 1ª anno
    # che in 2ª/3ª hanno da_acquistare=False e consigliato=False
    # Questi libri erano da comprare in 1ª, quindi chi è in 2ª/3ª può venderli ai 1ª
    # =====================================================
    if child_classe >= 2 and child_tipo == "secondo_grado":
        # Per ogni libro della classe ATTUALE con da_acquistare=False e consigliato=False
        # (NON volume unico) → questo libro era da comprare l'anno prima
        
        for libro in all_my_books:
            da_acquistare = libro.get('da_acquistare', True)
            consigliato = libro.get('consigliato', False)
            is_vu = libro.get('is_volume_unico', False)
            isbn = libro.get('isbn', '')
            disc = libro.get('disciplina', '')
            
            # Se da_acquistare=False E consigliato=False E non è volume unico
            # → Era da comprare in una classe precedente
            if not da_acquistare and not consigliato and not is_vu and isbn:
                # Verifica se non è già nei vendibili
                gia_vendibile = any(v.get('isbn') == isbn for v in vendibili)
                
                if not gia_vendibile:
                    # Trova la classe in cui era da comprare
                    # Cerca nelle adozioni delle classi precedenti
                    classe_acquisto = None
                    for classe_check in range(child_classe - 1, 0, -1):
                        libri_classe = await get_books_from_adozioni(child_codice_scuola, classe_check, child_sezione, "2026/2027")
                        for l in libri_classe:
                            if l.get('isbn') == isbn and l.get('da_acquistare', False):
                                classe_acquisto = classe_check
                                break
                        if classe_acquisto:
                            break
                    
                    # Se era da comprare in una classe precedente, è vendibile a quella classe
                    if classe_acquisto:
                        vendibili.append({
                            "isbn": isbn,
                            "disciplina": disc,
                            "titolo": libro.get('titolo', '')[:50],
                            "editore": libro.get('editore', ''),
                            "prezzo_consigliato": round(libro.get('prezzo', libro.get('prezzo_copertina', 0)) * 0.5, 2),
                            "status": "VENDIBILE",
                            "vendi_a": "Classi precedenti",
                            "motivo": f"Libro comprato in {classe_acquisto}ª - vendibile ai nuovi {classe_acquisto}ª"
                        })
    
    # =====================================================
    # FILTRO ESCLUSIVO: Ogni libro in UNA SOLA sezione
    # Priorità: 1. Vendibili, 2. Acquistabili Usati, 3. Ancora in Uso, 4. Nuovi
    # =====================================================
    
    # Step 1: Raccogli tutti gli ISBN dei vendibili (priorità massima)
    isbn_vendibili = {v.get('isbn') for v in vendibili if v.get('isbn')}
    
    # Step 2: Filtra "ancora in uso" per escludere vendibili
    non_vendibili_ancora_in_uso = [
        nv for nv in non_vendibili_ancora_in_uso 
        if nv.get('isbn') not in isbn_vendibili
    ]
    isbn_ancora_in_uso = {nv.get('isbn') for nv in non_vendibili_ancora_in_uso if nv.get('isbn')}
    
    # Step 3: Filtra acquistabili usati per escludere vendibili e ancora in uso
    comprare_usato_filtrato = [
        libro for libro in comprare_usato 
        if libro.get('isbn') not in isbn_vendibili and libro.get('isbn') not in isbn_ancora_in_uso
    ]
    isbn_acquistabili_usati = {l.get('isbn') for l in comprare_usato_filtrato if l.get('isbn')}
    
    # Step 4: Filtra nuovi per escludere vendibili, ancora in uso, e acquistabili usati
    comprare_nuovo_filtrato = [
        libro for libro in comprare_nuovo 
        if libro.get('isbn') not in isbn_vendibili 
        and libro.get('isbn') not in isbn_ancora_in_uso
        and libro.get('isbn') not in isbn_acquistabili_usati
    ]
    
    # Sostituisci le liste originali
    comprare_usato = comprare_usato_filtrato
    comprare_nuovo = comprare_nuovo_filtrato
    # vendibili rimane invariato (ha priorità massima)
    
    num_vendibili = len(vendibili)
    num_non_vendibili = len(non_vendibili_ancora_in_uso)
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
    
    # Per il confronto con il tetto ministeriale usiamo SOLO il costo dei testi NUOVI
    # (non la spesa stimata che include gli usati a prezzo ridotto)
    costo_testi_nuovi_totale = costo_obbligatori_nuovi + costo_obbligatori_usati  # Prezzo copertina di tutti i libri da comprare
    
    # Calcola anche il costo totale REALE (inclusi consigliati)
    costo_consigliati = sum(l.get("prezzo", 0) for l in libri_consigliati)
    costo_totale_tutti = costo_totale_obbligatori + costo_consigliati
    
    # Confronto con tetto di spesa - basato sul TOTALE TESTI NUOVI
    tetto_info = {
        "tetto_ministeriale": round(tetto_spesa, 2),
        "tetto_con_deroga_10": round(tetto_spesa * 1.10, 2),  # +10% deroga consentita
        "tetto_con_deroga_15": round(tetto_spesa * 1.15, 2),  # +15% deroga massima
        "costo_obbligatori": round(costo_totale_obbligatori, 2),
        "costo_testi_nuovi": round(costo_testi_nuovi_totale, 2),  # Totale testi nuovi per confronto ministeriale
        "costo_consigliati": round(costo_consigliati, 2),
        "costo_totale_tutti": round(costo_totale_tutti, 2),  # Obbligatori + Consigliati
        "differenza": round(costo_testi_nuovi_totale - tetto_spesa, 2),
        "percentuale_sforamento": round((costo_testi_nuovi_totale / tetto_spesa * 100) - 100, 1) if tetto_spesa > 0 else 0,
        "entro_limite": costo_testi_nuovi_totale <= tetto_spesa,
        "entro_deroga_10": costo_testi_nuovi_totale <= (tetto_spesa * 1.10),
        "entro_deroga_15": costo_testi_nuovi_totale <= (tetto_spesa * 1.15),
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
            "libri": vendibili,
            "libri_vendibili": vendibili,  # Alias per compatibilità frontend
            "libri_non_vendibili": non_vendibili_ancora_in_uso  # Solo libri ancora in uso
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
        
        # NUOVA SEZIONE: Libri già posseduti (volumi unici comprati negli anni precedenti)
        "libri_gia_posseduti": {
            "totale": len(libri_gia_posseduti),
            "libri": libri_gia_posseduti,
            "nota": "Volumi unici già acquistati negli anni precedenti - non vanno ricomprati."
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


def calcola_tetto_spesa(tipo_scuola: str, classe: int, costo_totale_libri: float) -> dict:
    """
    Calcola il tetto di spesa ministeriale per una determinata classe/scuola.
    Riferimento: D.M. n. 781 del 27/09/2013 - Art. 3
    """
    TETTI_SPESA = {
        "primo_grado": {  # Scuola Media (Secondaria I grado)
            1: 299.00,
            2: 119.00,
            3: 134.00
        },
        "secondo_grado": {  # Superiori - default liceo
            1: 310.00,
            2: 215.00,
            3: 300.00,
            4: 260.00,
            5: 280.00
        }
    }
    
    # Determina il tetto base
    if tipo_scuola == "primo_grado":
        tetto_base = TETTI_SPESA["primo_grado"].get(classe, 299.00)
        nome_scuola = "Scuola Secondaria di I Grado"
    else:
        tetto_base = TETTI_SPESA["secondo_grado"].get(classe, 310.00)
        nome_scuola = "Scuola Secondaria di II Grado"
    
    # Calcola deroghe
    tetto_deroga_10 = round(tetto_base * 1.10, 2)
    tetto_deroga_15 = round(tetto_base * 1.15, 2)
    
    # Calcola differenza
    differenza = round(costo_totale_libri - tetto_base, 2)
    percentuale = round((costo_totale_libri / tetto_base * 100) - 100, 1) if tetto_base > 0 else 0
    
    return {
        "tetto_ministeriale": tetto_base,
        "tetto_con_deroga_10": tetto_deroga_10,
        "tetto_con_deroga_15": tetto_deroga_15,
        "costo_libri": round(costo_totale_libri, 2),
        "differenza": differenza,
        "percentuale_sforamento": percentuale,
        "entro_limite": costo_totale_libri <= tetto_base,
        "entro_deroga_10": costo_totale_libri <= tetto_deroga_10,
        "entro_deroga_15": costo_totale_libri <= tetto_deroga_15,
        "riferimento_normativo": "D.M. n. 781 del 27/09/2013 - Art. 3",
        "nome_scuola": nome_scuola,
        "classe": classe
    }


@api_router.get("/profiles/{user_id}/children/{child_id}/analysis")
async def get_child_analysis_v2(user_id: str, child_id: str):
    """
    ENDPOINT ANALISI LIBRI v2 - 4 CATEGORIE SEMPLICI
    
    Categorie:
    1. ANCORA_IN_USO - Libri in entrambi gli anni (non vendibili)
    2. VENDIBILI_USATI - Libri solo nel 2025/2026 (possono essere venduti)
    3. DA_ACQUISTARE_USATI - Libri 2026/2027 disponibili usati da altri
    4. DA_ACQUISTARE_NUOVI - Libri 2026/2027 non disponibili usati
    """
    # Trova utente e profilo figlio
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    # Dati profilo
    child_classe_2026_2027 = int(child_profile.get("classe", 1))
    child_tipo = child_profile.get("tipo_scuola", "primo_grado")
    child_codice_scuola = child_profile.get("codice_scuola", "")
    child_sezione = child_profile.get("sezione", "A").upper()
    child_nome = child_profile.get("nome") or child_profile.get("nome_figlio", "Figlio")
    child_scuola = child_profile.get("scuola", "")
    child_fine_ciclo = child_profile.get("fine_ciclo", False)
    
    if not child_codice_scuola:
        return {
            "error": "Codice scuola non configurato",
            "child_name": child_nome,
            "child_classe": child_classe_2026_2027
        }
    
    # LOGICA CLASSE 2025/2026:
    # 1. Se il profilo ha esplicitamente classe_2025_2026 salvata -> usala
    # 2. Se è fine_ciclo -> calcola come classe_attuale (diplomato, vende tutto)
    # 3. Altrimenti -> calcola automaticamente (classe_attuale - 1, None se primo anno)
    
    saved_classe_2025_2026 = child_profile.get("classe_2025_2026")
    
    if saved_classe_2025_2026 is not None:
        # Caso 1: Classe esplicitamente salvata dal form
        child_classe_2025_2026 = int(saved_classe_2025_2026)
    elif child_fine_ciclo:
        # Caso 2: Fine ciclo -> la classe 2025/2026 è l'ultima frequentata
        # Lo studente ha finito il ciclo, quindi vendiamo i libri dell'ultimo anno
        # Per media: classe 3, per superiore: classe 5
        if child_tipo == "primo_grado":
            child_classe_2025_2026 = 3  # 3° media
        else:
            child_classe_2025_2026 = 5  # 5° superiore
    else:
        # Caso 3: Calcolo automatico (retrocompatibilità)
        child_classe_2025_2026 = calcola_classe_precedente(child_classe_2026_2027, child_tipo)
    
    # Se è fine ciclo, lo studente NON ha una classe 2026/2027 (è uscito)
    effective_classe_2026_2027 = None if child_fine_ciclo else child_classe_2026_2027
    
    # Usa la nuova logica v2 per classificare i libri
    classificazione = await classifica_libri_studente(
        db,
        codice_scuola=child_codice_scuola,
        classe_2025_2026=child_classe_2025_2026,
        classe_2026_2027=effective_classe_2026_2027,  # None se fine ciclo
        sezione=child_sezione
    )
    
    # Prepara risposta nel formato atteso dal frontend
    return {
        "child_id": child_id,
        "child_name": child_nome,
        "codice_scuola": child_codice_scuola,
        "scuola": child_scuola,
        "classe_2025_2026": child_classe_2025_2026,
        "classe_2026_2027": child_classe_2026_2027,
        "sezione": child_sezione,
        "tipo_scuola": child_tipo,
        "is_primo_anno": child_classe_2025_2026 is None,
        "is_fine_ciclo": child_fine_ciclo,
        
        # 4 CATEGORIE PRINCIPALI
        "ancora_in_uso": classificazione["ancora_in_uso"],
        "vendibili_usati": classificazione["vendibili_usati"],
        "da_acquistare_usati": classificazione["da_acquistare_usati"],
        "da_acquistare_nuovi": classificazione["da_acquistare_nuovi"],
        "fuori_corso": classificazione.get("fuori_corso", []),
        
        # RIEPILOGO
        "riepilogo": classificazione["riepilogo"],
        
        # TETTO DI SPESA MINISTERIALE - usa costo_testi_nuovi_totale (prezzo copertina)
        "tetto_spesa": calcola_tetto_spesa(
            child_tipo,
            child_classe_2026_2027,
            classificazione["riepilogo"]["costo_testi_nuovi_totale"]
        ),
        
        # TOTALI PER RETRO-COMPATIBILITÀ
        "totale_libri": (
            classificazione["riepilogo"]["totale_ancora_in_uso"] +
            classificazione["riepilogo"]["totale_vendibili"] +
            classificazione["riepilogo"]["totale_da_comprare_usati"] +
            classificazione["riepilogo"]["totale_da_comprare_nuovi"]
        ),
    }


# =====================================================
# ENDPOINT PUBBLICO PER UTENTI ANONIMI
# =====================================================
@api_router.get("/public/analysis/{codice_scuola}/{classe}/{sezione}")
async def get_public_analysis(codice_scuola: str, classe: int, sezione: str):
    """
    Endpoint pubblico per analisi libri senza autenticazione.
    Usato per utenti anonimi che hanno creato profili temporanei.
    """
    # Determina il tipo di scuola dal codice
    # MM = medie (primo_grado), altri = secondo_grado
    tipo_scuola = "primo_grado" if "MM" in codice_scuola else "secondo_grado"
    
    # Calcola la classe 2025/2026 (anno precedente)
    classe_2025_2026 = classe - 1 if classe > 1 else None
    classe_2026_2027 = classe
    
    # Usa la logica v2 per classificare i libri
    classificazione = await classifica_libri_studente(
        db,
        codice_scuola=codice_scuola,
        classe_2025_2026=classe_2025_2026,
        classe_2026_2027=classe_2026_2027,
        sezione=sezione
    )
    
    return {
        "codice_scuola": codice_scuola,
        "classe": classe,
        "sezione": sezione,
        "tipo_scuola": tipo_scuola,
        # Categorie libri dalla nuova logica v2
        "ancora_in_uso": classificazione["ancora_in_uso"],
        "vendibili_usati": classificazione["vendibili_usati"],
        "da_acquistare_usati": classificazione["da_acquistare_usati"],
        "da_acquistare_nuovi": classificazione["da_acquistare_nuovi"],
        "fuori_corso": classificazione.get("fuori_corso", []),
        "riepilogo": classificazione["riepilogo"],
    }


@api_router.get("/profiles/{user_id}/children/{child_id}/lista-ufficiale")
async def get_lista_ufficiale(user_id: str, child_id: str):
    """
    Restituisce la LISTA UFFICIALE dei libri dal database MIUR.
    Questa è separata dalla logica di scambio - mostra solo i dati oggettivi.
    Include: da_acquistare, nuova_adozione, consigliato come da database.
    """
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
    
    # Query per la classe/sezione
    adozioni_query = {
        "codice_scuola": child_codice_scuola,
        "classe": str(child_classe),
        "sezione": {"$regex": f"^{child_sezione}$", "$options": "i"}
    }
    
    books = await db.adozioni.find(adozioni_query).to_list(length=100)
    
    # Fallback se nessun libro trovato
    if not books:
        fallback_query = {
            "codice_scuola": child_codice_scuola,
            "classe": str(child_classe)
        }
        all_books = await db.adozioni.find(fallback_query).to_list(length=200)
        if all_books:
            prima_sezione = all_books[0].get("sezione")
            books = [b for b in all_books if b.get("sezione") == prima_sezione]
    
    # Prepara la lista con dati oggettivi dal database
    lista_ufficiale = []
    totale_da_acquistare = 0
    
    for book in sorted(books, key=lambda x: x.get('disciplina', '')):
        prezzo_raw = book.get('prezzo') or book.get('prezzo_copertina') or 0
        try:
            prezzo = float(prezzo_raw) if prezzo_raw else 0
        except (ValueError, TypeError):
            prezzo = 0
        
        libro = {
            "disciplina": book.get('disciplina', ''),
            "isbn": book.get('isbn', ''),
            "autori": book.get('autori', ''),
            "titolo": book.get('titolo', ''),
            "sottotitolo": book.get('sottotitolo', ''),
            "volume": book.get('volume', ''),
            "editore": book.get('editore', ''),
            "prezzo": prezzo,
            # DATI OGGETTIVI DAL DATABASE MIUR
            "nuova_adozione": book.get('nuova_adozione', False) == True,
            "da_acquistare": book.get('da_acquistare', False) == True,
            "consigliato": book.get('consigliato', False) == True,
        }
        lista_ufficiale.append(libro)
        
        # Calcola totale solo per libri da acquistare
        if libro["da_acquistare"] and prezzo:
            totale_da_acquistare += prezzo
    
    return {
        "child_id": child_id,
        "child_name": child_nome,
        "scuola": child_scuola,
        "codice_scuola": child_codice_scuola,
        "classe": child_classe,
        "sezione": child_sezione,
        "tipo_scuola": child_tipo,
        "anno_scolastico": "2026/2027",
        "libri": lista_ufficiale,
        "totale_libri": len(lista_ufficiale),
        "totale_da_acquistare": round(totale_da_acquistare, 2),
        "nota": "Lista ufficiale MIUR - dati oggettivi senza logica di scambio"
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
    
    # Get books from adozioni collection - campo classe è stringa
    adozioni_query = {
        "codice_scuola": child_codice_scuola,
        "classe": str(child_classe),  # classe è una stringa nel database
        "sezione": {"$regex": f"^{child_sezione}$", "$options": "i"}
    }
    
    books = await db.adozioni.find(adozioni_query).to_list(length=100)
    
    # Fallback se nessun libro trovato con sezione specifica
    if not books:
        fallback_query = {
            "codice_scuola": child_codice_scuola,
            "classe": str(child_classe)
        }
        all_books = await db.adozioni.find(fallback_query).to_list(length=200)
        if all_books:
            # Prendi la prima sezione disponibile
            prima_sezione = all_books[0].get("sezione")
            books = [b for b in all_books if b.get("sezione") == prima_sezione]
    
    # Create PDF - LANDSCAPE A4 (orizzontale)
    buffer = io.BytesIO()
    page_width, page_height = landscape(A4)  # Landscape orientation
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=landscape(A4),  # Landscape 
        topMargin=0.5*cm,
        bottomMargin=0.5*cm,
        leftMargin=0.5*cm,
        rightMargin=0.5*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Styles - font più leggibili per landscape
    header_style = ParagraphStyle('Header', fontSize=11, leading=13)
    cell_style = ParagraphStyle('Cell', fontSize=7, leading=9, wordWrap='CJK')
    cell_bold = ParagraphStyle('CellBold', fontSize=7, leading=9, fontName='Helvetica-Bold', wordWrap='CJK')
    
    # Header
    scuola_nome = child_scuola.split('-')[0].strip() if '-' in child_scuola else child_scuola
    tipo_scuola_label = "SCUOLA SECONDARIA DI I GRADO" if child_tipo == "primo_grado" else "SCUOLA SECONDARIA DI II GRADO"
    classe_label = f"{child_classe} {child_sezione}"
    
    # Logo RiBook - usa immagine invece di testo (LOGO PIÙ GRANDE)
    import os
    logo_path = os.path.join(os.path.dirname(__file__), 'assets', 'ribook-logo.png')
    
    # Crea l'elemento logo se il file esiste, altrimenti usa testo fallback (PIÙ GRANDE)
    if os.path.exists(logo_path):
        logo_img = Image(logo_path, width=4.5*cm, height=1.8*cm)
    else:
        logo_img = Paragraph("<b><font size='22'>RiBook</font></b>", ParagraphStyle('Code', fontSize=22, fontName='Helvetica-Bold', alignment=TA_CENTER))
    
    header_data = [[
        Paragraph(f"<b><font size='12'>{scuola_nome.upper()}</font></b><br/><font size='10'>{child_codice_scuola}</font><br/><font size='9'>88100 Catanzaro</font>", header_style),
        logo_img,
        Paragraph(f"<b><font size='11'>ELENCO DEI LIBRI DI TESTO<br/>ADOTTATI O CONSIGLIATI</font></b><br/><br/><font size='10'>Tipo Scuola: {tipo_scuola_label}<br/>Classe: {classe_label}<br/><b>Anno Scolastico 2026-2027</b></font>", 
                 ParagraphStyle('RightHeader', fontSize=10, leading=12, alignment=TA_LEFT))
    ]]
    
    header_table = Table(header_data, colWidths=[8*cm, 5*cm, 10*cm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 0.4*cm))
    
    # Table header - colonne ridotte per portrait
    table_data = [[
        Paragraph('<b>Materia</b>', cell_bold),
        Paragraph('<b>ISBN</b>', cell_bold),
        Paragraph('<b>Autore</b>', cell_bold),
        Paragraph('<b>Titolo</b>', cell_bold),
        Paragraph('<b>Vol.</b>', cell_bold),
        Paragraph('<b>Editore</b>', cell_bold),
        Paragraph('<b>Prezzo</b>', cell_bold),
        Paragraph('<b>Nuova</b>', cell_bold),
        Paragraph('<b>Acq.</b>', cell_bold),
        Paragraph('<b>Cons.</b>', cell_bold),
    ]]
    
    # Colonne ottimizzate per A4 Landscape (larghezza ~28cm disponibili)
    col_widths = [3*cm, 2.5*cm, 4*cm, 9*cm, 0.8*cm, 3*cm, 1.5*cm, 1.2*cm, 1.1*cm, 1.1*cm]
    
    # Totale libri da acquistare
    total_price = 0
    
    # Add books
    for book in sorted(books, key=lambda x: x.get('disciplina', '')):
        disciplina = book.get('disciplina', '')
        isbn = book.get('isbn', '') or '-'
        autori = book.get('autori', '') or '-'
        titolo = book.get('titolo', '')
        editore = book.get('editore', '') or '-'
        
        # Prezzo - usa il campo 'prezzo' dal database
        prezzo_raw = book.get('prezzo') or book.get('prezzo_copertina') or book.get('prezzo_ministeriale') or 0
        try:
            prezzo = float(prezzo_raw) if prezzo_raw else 0
        except (ValueError, TypeError):
            prezzo = 0
        
        # Volume - usa il campo dal database
        vol = book.get('volume', '') or str(child_classe)
        
        # DATI OGGETTIVI DAL DATABASE - NESSUNA LOGICA AGGIUNTIVA
        # Questi campi vengono mostrati esattamente come sono nel database MIUR
        nuova_adoz = "Si" if book.get('nuova_adozione') == True else "No"
        da_acq = "Si" if book.get('da_acquistare') == True else "No"
        consigliato = "Ap" if book.get('consigliato') == True else "No"
        
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
        
        # Somma al totale se da acquistare (secondo il database MIUR)
        if book.get('da_acquistare') == True and prezzo:
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
        ('TOPPADDING', (0, 0), (-1, -1), 2),  # Ridotto
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),  # Ridotto
        ('LEFTPADDING', (0, 0), (-1, -1), 2),  # Ridotto
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),  # Ridotto
        ('GRID', (0, 0), (-1, -1), 0.5, colors.black),
        ('BOX', (0, 0), (-1, -1), 1, colors.black),
    ]))
    elements.append(table)
    
    # Footer - più compatto
    elements.append(Spacer(1, 0.2*cm))
    footer_style = ParagraphStyle('Footer', fontSize=9)
    elements.append(Paragraph(f"A.S. 2026/2027 - Aggiornamento: {datetime.now().strftime('%d/%m/%Y')}                                                       Generato da RiLiBro", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    
    filename = f"lista_libri_{child_nome}_{child_classe}{child_sezione}.pdf"
    
    # Headers per forzare il download
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Content-Type": "application/pdf",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Access-Control-Expose-Headers": "Content-Disposition"
    }
    
    return StreamingResponse(
        buffer, 
        media_type="application/pdf", 
        headers=headers
    )


@api_router.get("/profiles/{user_id}/children/{child_id}/books-html")
async def generate_books_html(user_id: str, child_id: str):
    """
    Genera pagina HTML responsive per visualizzare la lista libri su mobile
    """
    from fastapi.responses import HTMLResponse
    
    # Get user and child profile
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    profili_figli = user.get("profili_figli", [])
    child_profile = next((p for p in profili_figli if p.get("id") == child_id), None)
    
    if not child_profile:
        raise HTTPException(status_code=404, detail="Profilo figlio non trovato")
    
    child_nome = child_profile.get("nome_figlio", "Figlio")
    child_scuola = child_profile.get("scuola", child_profile.get("school_name", ""))
    child_classe = int(child_profile.get("classe", 1))
    child_sezione = child_profile.get("sezione", "A")
    child_codice_scuola = child_profile.get("codice_scuola", child_profile.get("school_code", ""))
    
    # Get books from adozioni - NUOVA STRUTTURA con anno_corso stringa
    adozioni_query = {
        "codice_scuola": child_codice_scuola,
        "anno_corso": str(child_classe),
        "sezione": {"$regex": f"^{child_sezione}$", "$options": "i"}
    }
    
    books = await db.adozioni.find(adozioni_query).to_list(length=100)
    
    # Fallback se nessun libro trovato con sezione specifica
    if not books:
        fallback_query = {
            "codice_scuola": child_codice_scuola,
            "anno_corso": str(child_classe)
        }
        all_books = await db.adozioni.find(fallback_query).to_list(length=200)
        if all_books:
            # Prendi la prima sezione disponibile
            prima_sezione = all_books[0].get("sezione")
            books = [b for b in all_books if b.get("sezione") == prima_sezione]
    
    # Build HTML
    books_html = ""
    for book in books:
        nuova_adoz = "✓" if book.get("nuova_adozione") else ""
        da_acq = "✓" if book.get("da_acquistare") else ""
        consig = "✓" if book.get("consigliato") else ""
        prezzo = f"€{book.get('prezzo_copertina', 0):.2f}"
        
        books_html += f"""
        <div class="book">
            <div class="book-header">
                <span class="disciplina">{book.get('disciplina', '')}</span>
                <span class="prezzo">{prezzo}</span>
            </div>
            <div class="titolo">{book.get('titolo', '')}</div>
            <div class="autore">{book.get('autori', '')} - {book.get('editore', '')}</div>
            <div class="isbn">ISBN: {book.get('isbn', '')}</div>
            <div class="badges">
                {f'<span class="badge nuova">N.ADOZ</span>' if nuova_adoz else ''}
                {f'<span class="badge acquista">ACQUISTA</span>' if da_acq else ''}
                {f'<span class="badge consig">CONSIG.</span>' if consig else ''}
            </div>
        </div>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lista Libri - {child_nome}</title>
        <style>
            @page {{ 
                size: landscape;
            }}
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            html {{
                /* Forza orientamento landscape */
                transform-origin: top left;
            }}
            body {{ 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                padding: 10px;
                min-height: 100vh;
            }}
            /* Banner per consigliare rotazione su mobile */
            .rotate-hint {{
                display: none;
                background: #1a472a;
                color: white;
                padding: 12px;
                text-align: center;
                font-size: 14px;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 1000;
            }}
            @media (orientation: portrait) and (max-width: 768px) {{
                .rotate-hint {{
                    display: block;
                }}
                body {{
                    padding-top: 50px;
                }}
            }}
            .header {{
                background: #1a472a;
                color: white;
                padding: 15px;
                text-align: center;
                border-radius: 10px;
                margin-bottom: 15px;
            }}
            .header h1 {{ font-size: 28px; letter-spacing: 3px; }}
            .header .info {{ font-size: 12px; opacity: 0.9; margin-top: 5px; }}
            .header .scuola {{ font-size: 14px; font-weight: bold; margin-top: 5px; }}
            
            .books-container {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 10px;
            }}
            
            @media (orientation: landscape) {{
                .books-container {{
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                }}
                .book {{ padding: 10px; }}
            }}
            
            .book {{
                background: white;
                border-radius: 8px;
                padding: 12px;
                border-left: 4px solid #1a472a;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }}
            .book-header {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }}
            .disciplina {{
                background: #e8f5e9;
                color: #1a472a;
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: bold;
            }}
            .prezzo {{
                font-size: 16px;
                font-weight: bold;
                color: #1a472a;
            }}
            .titolo {{
                font-size: 14px;
                font-weight: 600;
                color: #333;
                margin-bottom: 5px;
                line-height: 1.3;
            }}
            .autore {{
                font-size: 11px;
                color: #666;
                margin-bottom: 5px;
            }}
            .isbn {{
                font-size: 11px;
                color: #888;
                font-family: monospace;
                background: #f5f5f5;
                padding: 3px 6px;
                border-radius: 3px;
                display: inline-block;
                margin-bottom: 8px;
            }}
            .badges {{
                display: flex;
                gap: 5px;
                flex-wrap: wrap;
            }}
            .badge {{
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 3px;
                font-weight: bold;
            }}
            .badge.nuova {{ background: #e3f2fd; color: #1565c0; }}
            .badge.acquista {{ background: #ffebee; color: #c62828; }}
            .badge.consig {{ background: #fff3e0; color: #ef6c00; }}
            
            .footer {{
                text-align: center;
                padding: 15px;
                color: #888;
                font-size: 12px;
            }}
        </style>
    </head>
    <body>
        <div class="rotate-hint">📱 Ruota il telefono in orizzontale per una visualizzazione migliore</div>
        <div class="header">
            <h1>RiLiBro</h1>
            <div class="info">Classe {child_classe}{child_sezione} • A.S. 2026/2027</div>
            <div class="scuola">{child_scuola}</div>
            <div class="info">Cod. {child_codice_scuola}</div>
        </div>
        
        <div class="books-container">
            {books_html}
        </div>
        
        <div class="footer">
            Totale: {len(books)} libri • Generato da RiLiBro
        </div>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)



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
        else:
            # Tutti gli altri anni possono vendere alle classi precedenti
            classe_compratori = child_classe - 1
    
    if not classe_compratori:
        # Solo il primo anno non può vendere
        return {"books": [], "message": "Primo anno - niente da vendere", "classe_destinazione": None}
    
    # === LOGICA ALLINEATA AL RADAR ===
    # USA LA STESSA LOGICA DEL COMPATIBILITY ENDPOINT (collezione adozioni)
    
    async def get_books_from_adozioni(codice_scuola: str, classe: int, sezione: str, anno_scolastico: str = "2026/2027") -> list:
        """Recupera libri dalla collezione adozioni per una specifica combinazione.
        Se la sezione non esiste, usa la prima sezione disponibile (fallback).
        
        anno_scolastico: "2026/2027" (corrente) o "2025/2026" (storico)
        
        NOTA: Nella nuova struttura, ogni documento in 'adozioni' è un singolo libro.
        Il campo è 'anno_corso' (stringa) non 'classe' (intero).
        """
        # Scegli la collezione in base all'anno scolastico
        if anno_scolastico == "2025/2026":
            collection = db.adozioni_2025_2026
        else:
            # Default: collezione corrente 2026/2027
            collection = db.adozioni
        
        # Converte classe in stringa per il match
        classe_str = str(classe)
        
        # Prima prova con la sezione esatta
        libri = await collection.find({
            "codice_scuola": codice_scuola,
            "anno_corso": classe_str,
            "sezione": sezione.upper()
        }).to_list(None)
        
        if libri:
            # Trasforma ogni documento adozione nel formato libro atteso
            return [{
                "isbn": libro.get("isbn"),
                "titolo": libro.get("titolo"),
                "sottotitolo": libro.get("sottotitolo", ""),
                "autori": libro.get("autori"),
                "editore": libro.get("editore"),
                "disciplina": libro.get("disciplina"),
                "prezzo_copertina": libro.get("prezzo") or libro.get("prezzo_copertina", 0),
                "volume": libro.get("volume", ""),
                "is_volume_unico": libro.get("volume", "").upper() == "U",
                "da_acquistare": libro.get("da_acquistare", True),
                "consigliato": libro.get("consigliato", False),
                "nuova_adozione": libro.get("nuova_adozione", False),
            } for libro in libri]
        
        # FALLBACK: Se la sezione non esiste, usa qualsiasi sezione disponibile per quella classe
        libri_fallback = await collection.find({
            "codice_scuola": codice_scuola,
            "anno_corso": classe_str
        }).to_list(None)
        
        if libri_fallback:
            # Prendi solo la prima sezione trovata per evitare duplicati
            prima_sezione = libri_fallback[0].get("sezione") if libri_fallback else None
            if prima_sezione:
                libri_filtrati = [l for l in libri_fallback if l.get("sezione") == prima_sezione]
                return [{
                    "isbn": libro.get("isbn"),
                    "titolo": libro.get("titolo"),
                    "sottotitolo": libro.get("sottotitolo", ""),
                    "autori": libro.get("autori"),
                    "editore": libro.get("editore"),
                    "disciplina": libro.get("disciplina"),
                    "prezzo_copertina": libro.get("prezzo") or libro.get("prezzo_copertina", 0),
                    "volume": libro.get("volume", ""),
                    "is_volume_unico": libro.get("volume", "").upper() == "U",
                    "da_acquistare": libro.get("da_acquistare", True),
                    "consigliato": libro.get("consigliato", False),
                    "nuova_adozione": libro.get("nuova_adozione", False),
                } for libro in libri_filtrati]
        
        return []
    
    # Carica libri della classe PRECEDENTE che LO STUDENTE HA USATO L'ANNO SCORSO (2024/2025)
    child_sezione = child_profile.get("sezione", "A").upper()
    libri_precedente = await get_books_from_adozioni(child_codice_scuola, classe_compratori, child_sezione, "2025/2026")
    
    # Carica libri della classe ATTUALE per i COMPRATORI (2025/2026)
    libri_compratori = await get_books_from_adozioni(child_codice_scuola, classe_compratori, child_sezione, "2026/2027")
    
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
    # I libri vendibili sono quelli che lo studente aveva l'anno scorso (2024/2025)
    # e che sono ancora adottati per la stessa classe quest'anno (2025/2026)
    
    # Crea mappa ISBN per confronto veloce
    isbn_compratori = {b.get("isbn"): b for b in libri_compratori if b.get("isbn")}
    
    # IMPORTANTE: Crea mappa ISBN dei libri della CLASSE ATTUALE dello studente
    # per escludere i volumi unici che servono ancora
    isbn_classe_attuale = {b.get("isbn"): b for b in libri_attuali if b.get("isbn")}
    
    for b in libri_precedente:
        isbn = b.get("isbn", "")
        if not isbn:
            continue
        
        # =====================================================
        # STEP 0: Se il libro aveva da_acquistare=False nell'anno precedente,
        # significa che è un VOLUME UNICO che lo studente già possedeva.
        # Serve ancora SOLO SE lo stesso ISBN è presente nella classe attuale.
        # =====================================================
        if not b.get("da_acquistare", True):
            # Controlla se lo stesso ISBN esiste nella classe attuale
            if isbn in isbn_classe_attuale:
                # Volume unico che serve ancora, NON VENDIBILE
                continue
            # Lo stesso ISBN NON è nella classe attuale, può essere venduto
            if isbn in isbn_compratori:
                vendibili.append({
                    "id": isbn,
                    "isbn": isbn,
                    "titolo": b.get("titolo", ""),
                    "autori": b.get("autori", ""),
                    "disciplina": b.get("disciplina", ""),
                    "editore": b.get("editore", ""),
                    "prezzo_copertina": b.get("prezzo_copertina", b.get("prezzo", 0)),
                    "prezzo_suggerito": round(b.get("prezzo_copertina", b.get("prezzo", 0)) * 0.5, 2),
                    "classe_destinazione": classe_compratori,
                    "tipo": "vendibile",
                    "status": "VENDIBILE"
                })
            continue
        
        # =====================================================
        # STEP 1: Verifica se è un volume unico che SERVE ANCORA
        # (stesso ISBN usato nella classe attuale dello studente)
        # =====================================================
        if isbn in isbn_classe_attuale:
            # Lo stesso ISBN è adottato anche nella classe attuale → SERVE ANCORA, NON VENDIBILE
            continue
        
        # =====================================================
        # STEP 2: Se lo stesso ISBN è adottato per i nuovi studenti → VENDIBILE
        # =====================================================
        if isbn in isbn_compratori:
            vendibili.append({
                "id": isbn,
                "isbn": isbn,
                "titolo": b.get("titolo", ""),
                "autori": b.get("autori", ""),
                "disciplina": b.get("disciplina", ""),
                "editore": b.get("editore", ""),
                "prezzo_copertina": b.get("prezzo_copertina", b.get("prezzo", 0)),
                "prezzo_suggerito": round(b.get("prezzo_copertina", b.get("prezzo", 0)) * 0.5, 2),
                "classe_destinazione": classe_compratori,
                "tipo": "vendibile",
                "status": "VENDIBILE"
            })
    
    # Per il 3° anno superiore: aggiungi anche i libri vendibili alla 1ª
    # (libri che in 3ª hanno da_acquistare=False, erano da comprare in 1ª o 2ª)
    if not isMedia and child_classe == 3:
        # Carica libri del 3° anno (classe attuale)
        libri_3_anno = await get_books_from_adozioni(child_codice_scuola, 3, child_sezione, "2026/2027")
        
        # Per ogni libro della 3ª con da_acquistare=False → era comprato prima
        for libro in libri_3_anno:
            if not libro.get('da_acquistare', True) and not libro.get('consigliato', False):
                isbn = libro.get('isbn', '')
                if not isbn:
                    continue
                
                # Verifica se non è già nei vendibili
                if isbn in [v.get('isbn') for v in vendibili]:
                    continue
                
                # Cerca in quale classe era da comprare (1ª o 2ª)
                for classe_check in [1, 2]:
                    libri_classe = await get_books_from_adozioni(child_codice_scuola, classe_check, child_sezione, "2026/2027")
                    for l in libri_classe:
                        if l.get('isbn') == isbn and l.get('da_acquistare', False):
                            vendibili.append({
                                "id": isbn,
                                "isbn": isbn,
                                "titolo": libro.get("titolo", ""),
                                "autori": libro.get("autori", ""),
                                "disciplina": libro.get("disciplina", ""),
                                "editore": libro.get("editore", ""),
                                "prezzo_copertina": libro.get("prezzo_copertina", libro.get("prezzo", 0)),
                                "prezzo_suggerito": round(libro.get("prezzo_copertina", libro.get("prezzo", 0)) * 0.5, 2),
                                "classe_destinazione": classe_check,
                                "tipo": "vendibile",
                                "status": "VENDIBILE"
                            })
                            break
    
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
                # Conta copie disponibili e trova prezzo minimo
                isbn = my_book.get("isbn", "")
                if isbn:
                    listings_cursor = db.listings.find({
                        "book_isbn": isbn,
                        "status": "available"
                    }, {"prezzo_vendita": 1}).sort("prezzo_vendita", 1)
                    listings_list = await listings_cursor.to_list(100)
                    copie_count = len(listings_list)
                    # Prezzo minimo dagli annunci disponibili, altrimenti 50% del prezzo copertina
                    if listings_list and listings_list[0].get("prezzo_vendita"):
                        prezzo_usato_effettivo = listings_list[0].get("prezzo_vendita")
                    else:
                        prezzo_usato_effettivo = round(my_book.get("prezzo_copertina", 0) * 0.5, 2)
                else:
                    copie_count = 0
                    prezzo_usato_effettivo = round(my_book.get("prezzo_copertina", 0) * 0.5, 2)
                
                comprabilità.append({
                    "id": my_book.get("isbn", ""),
                    "isbn": my_book.get("isbn", ""),
                    "titolo": my_book.get("titolo", ""),
                    "autori": my_book.get("autori", ""),
                    "disciplina": disc,
                    "editore": my_book.get("editore", ""),
                    "prezzo_copertina": my_book.get("prezzo_copertina", 0),
                    "prezzo_usato": prezzo_usato_effettivo,
                    "risparmio": round(my_book.get("prezzo_copertina", 0) - prezzo_usato_effettivo, 2),
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
async def add_to_cart(listing_id: str, bookstore_id: str, buyer_id: str, include_foderazione: bool = False):
    """Aggiunge un libro al carrello e notifica il venditore"""
    from datetime import timedelta
    
    # Get listing
    listing = await db.listings.find_one({"id": listing_id, "status": "available"})
    if not listing:
        # Prova anche con stato disponibile
        listing = await db.listings.find_one({"id": listing_id, "stato": "disponibile"})
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
    
    # Calcola commissioni con foderazione
    prezzo_libro = listing.get("prezzo_vendita", listing.get("prezzo", 0))
    commissioni = calcola_commissioni(prezzo_libro, include_foderazione)
    
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
        "prezzo_libro": prezzo_libro,
        "prezzo": prezzo_libro,  # Mantieni per compatibilità
        "include_foderazione": include_foderazione,
        "costo_foderazione": commissioni["costo_foderazione"],
        "totale_acquirente": commissioni["totale_acquirente"],
        "netto_venditore": commissioni["netto_venditore"],
        "commissione_app": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria": commissioni["commissione_cartolibreria_totale"],
        "bookstore_id": bookstore_id,
        "bookstore_nome": bookstore.get("nome", ""),
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    
    await db.cart_items.insert_one(cart_item)
    
    # CREA ANCHE UN ORDINE nella collezione orders (per essere visualizzato nel carrello)
    # Questo ordine sarà in stato "in_attesa_conferma_venditore"
    seller = await db.users.find_one({"id": listing["seller_id"]})
    seller_name = seller.get("username", "Venditore") if seller else "Venditore"
    buyer = await db.users.find_one({"id": buyer_id})
    buyer_name = buyer.get("username", "Acquirente") if buyer else "Acquirente"
    
    order_code = f"RB{now.strftime('%d%m')}{str(uuid.uuid4())[:4].upper()}"
    seller_confirmation_deadline = now + timedelta(hours=24)
    
    order_for_cart = {
        "id": cart_item["id"],  # Usa lo stesso ID del cart_item
        "order_code": order_code,
        "buyer_id": buyer_id,
        "buyer_name": buyer_name,
        "seller_id": listing["seller_id"],
        "seller_name": seller_name,
        "listing_id": listing_id,
        "book_isbn": listing.get("book_isbn", ""),
        "book_titolo": listing.get("book_titolo", ""),
        "book_autore": listing.get("book_autore", ""),
        "book_editore": listing.get("book_editore", ""),
        "bookstore_id": bookstore_id,
        "bookstore_name": bookstore.get("nome", ""),
        "prezzo_libro": prezzo_libro,
        "include_foderazione": include_foderazione,
        "costo_foderazione": commissioni["costo_foderazione"],
        "totale_acquirente": commissioni["totale_acquirente"],
        "netto_venditore": commissioni["netto_venditore"],
        "commissione_app": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria": commissioni["commissione_cartolibreria_totale"],
        "commissione_piattaforma": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria_libro": commissioni["commissione_cartolibreria_libro"],
        "commissione_cartolibreria_foderazione": commissioni["commissione_cartolibreria_foderazione"],
        "status": "in_attesa_conferma_venditore",
        "seller_confirmation_deadline": seller_confirmation_deadline.isoformat(),
        "created_at": now.isoformat(),
        "status_history": [{
            "status": "in_attesa_conferma_venditore",
            "timestamp": now.isoformat(),
            "note": "Richiesta inviata - Il venditore ha 24h per confermare"
        }]
    }
    await db.orders.insert_one(order_for_cart)
    
    # Update listing status to reserved
    await db.listings.update_one(
        {"id": listing_id},
        {"$set": {"status": "reserved", "reserved_by": buyer_id, "reserved_at": now.isoformat()}}
    )
    
    # Create notification for seller
    buyer = await db.users.find_one({"id": buyer_id})
    expires_at = now + timedelta(hours=24)  # Scade dopo 24 ore
    
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": listing["seller_id"],
        "type": "confirmation_request",
        "title": "Richiesta di conferma",
        "message": f"{buyer.get('username', 'Un utente')} vuole acquistare '{listing.get('book_title', listing.get('book_titolo', 'un libro'))}'",
        "data": {
            "cart_item_id": cart_item["id"],
            "listing_id": listing_id,
            "buyer_id": buyer_id,
            "book_title": listing.get('book_title', listing.get('book_titolo', 'Libro')),
            "buyer_name": buyer.get('username', buyer.get('nome', 'Utente'))
        },
        "read": False,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "status": "pending"  # pending, confirmed, rejected, expired
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


@api_router.put("/orders/{order_id}/foderazione")
async def update_order_foderazione(order_id: str, buyer_id: str, include_foderazione: bool):
    """Aggiorna la foderazione di un ordine nel carrello (solo prima del pagamento)"""
    
    # Trova l'ordine
    order = await db.orders.find_one({
        "id": order_id,
        "buyer_id": buyer_id,
        "status": {"$in": ["in_attesa_conferma_venditore", "in_attesa_pagamento", "pending_seller_confirmation", "ready_for_payment"]}
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato o già pagato")
    
    # Ricalcola le commissioni
    prezzo_libro = order.get("prezzo_libro", 0)
    commissioni = calcola_commissioni(prezzo_libro, include_foderazione)
    
    # Aggiorna l'ordine
    update_data = {
        "include_foderazione": include_foderazione,
        "costo_foderazione": commissioni["costo_foderazione"],
        "totale_acquirente": commissioni["totale_acquirente"],
        "netto_venditore": commissioni["netto_venditore"],
        "commissione_app": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria": commissioni["commissione_cartolibreria_totale"],
        "commissione_piattaforma": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria_libro": commissioni["commissione_cartolibreria_libro"],
        "commissione_cartolibreria_foderazione": commissioni["commissione_cartolibreria_foderazione"]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Aggiorna anche cart_items se esiste
    await db.cart_items.update_one(
        {"id": order_id},
        {"$set": {
            "include_foderazione": include_foderazione,
            "costo_foderazione": commissioni["costo_foderazione"],
            "totale_acquirente": commissioni["totale_acquirente"]
        }}
    )
    
    return {
        "message": "Foderazione aggiornata",
        "include_foderazione": include_foderazione,
        "prezzo_libro": prezzo_libro,
        "costo_foderazione": commissioni["costo_foderazione"],
        "totale_acquirente": commissioni["totale_acquirente"]
    }


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
    
    # ==========================================
    # CHECK ORDINI DUPLICATI - Evita doppi ordini
    # ==========================================
    existing_order = await db.orders.find_one({
        "listing_id": actual_listing_id,
        "status": {"$nin": ["cancelled", "refunded", "rejected", "completed"]}
    })
    if existing_order:
        # Se l'ordine esistente è dello stesso acquirente, restituisci info
        if existing_order.get("buyer_id") == user_id:
            raise HTTPException(
                status_code=400, 
                detail=f"Hai già un ordine attivo per questo libro (ordine #{existing_order.get('order_code')})"
            )
        else:
            raise HTTPException(status_code=400, detail="Questo libro è già stato riservato da un altro utente")
    
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
    
    # Verifica se include foderazione (dalla request o dal listing)
    include_foderazione = False
    if request and hasattr(request, 'include_foderazione'):
        include_foderazione = request.include_foderazione
    
    # Calcola prezzi con la nuova logica
    prezzo_libro = listing.get("prezzo_vendita", listing.get("prezzo", 0))
    commissioni = calcola_commissioni(prezzo_libro, include_foderazione)
    
    # Calcola deadline conferma venditore (24h)
    from datetime import timedelta
    now = datetime.utcnow()
    seller_confirmation_deadline = now + timedelta(hours=SELLER_CONFIRMATION_HOURS)
    
    # Genera codice utente anonimo per il venditore
    buyer_code = f"REB-{user_id[:6].upper()}"
    
    # Crea ordine con nuovo flusso e commissioni corrette
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
        book_condizioni=listing.get("condizioni", listing.get("condition", "")),
        prezzo_libro=round(prezzo_libro, 2),
        commissione_app=round(commissioni["commissione_piattaforma"], 2),
        commissione_cartolibreria=round(commissioni["commissione_cartolibreria_totale"], 2),
        totale_acquirente=round(commissioni["totale_acquirente"], 2),
        netto_venditore=round(commissioni["netto_venditore"], 2),
        include_foderazione=include_foderazione,
        costo_foderazione=commissioni["costo_foderazione"],
        commissione_stripe=commissioni["commissione_stripe"],
        commissione_piattaforma=commissioni["commissione_piattaforma"],
        commissione_cartolibreria_libro=commissioni["commissione_cartolibreria_libro"],
        commissione_cartolibreria_foderazione=commissioni["commissione_cartolibreria_foderazione"],
        status="in_attesa_conferma_venditore",
        seller_confirmation_deadline=seller_confirmation_deadline,
        condition_details=listing.get("condition_details", {}),
        status_history=[{
            "status": "in_attesa_conferma_venditore",
            "timestamp": now.isoformat(),
            "note": f"Richiesta inviata - Il venditore ha 24h per confermare la disponibilità"
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
        "message": f"L'utente {buyer_code} è interessato al testo:\n📚 {order.book_titolo}\n\nConfermi la disponibilità del testo e la consegna entro 2 giorni lavorativi presso:\n🏪 {order.bookstore_name}\n\nSeleziona una delle opzioni:\n✅ DISPONIBILE\n❌ NON DISPONIBILE",
        "order_id": order.id,
        "order_code": order.order_code,
        "data": {
            "order_id": order.id,
            "order_code": order.order_code,
            "book_titolo": order.book_titolo,
            "buyer_code": buyer_code,
            "bookstore_name": order.bookstore_name,
            "prezzo": order.netto_venditore,
            "deadline": seller_confirmation_deadline.isoformat()
        },
        "requires_action": True,
        "action_type": "seller_confirmation",
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_seller)
    
    # Notifica all'acquirente
    notification_buyer = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "order_pending_seller",
        "title": "Richiesta inviata!",
        "message": f"La tua richiesta per:\n📚 {order.book_titolo}\n\nè stata inviata al venditore.\n\nIl venditore ha 24 ore per confermare la disponibilità.",
        "order_id": order.id,
        "order_code": order.order_code,
        "data": {
            "order_id": order.id,
            "book_titolo": order.book_titolo
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_buyer)
    
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "totale": order.totale_acquirente,
        "status": order.status,
        "status_label": ORDER_STATES.get(order.status, order.status),
        "seller_confirmation_deadline": seller_confirmation_deadline.isoformat(),
        "message": "Richiesta inviata! Il venditore deve confermare la disponibilità entro 24 ore."
    }

@api_router.post("/orders/{order_id}/seller-confirm")
async def seller_confirm_order(order_id: str, user_id: str = Query(...)):
    """Venditore conferma la disponibilità del libro - DISPONIBILE"""
    
    order = await db.orders.find_one({"id": order_id, "seller_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    current_status = order.get("status")
    if current_status not in ["pending_seller_confirmation", "in_attesa_conferma_venditore"]:
        raise HTTPException(status_code=400, detail="Ordine non in attesa di conferma")
    
    now = datetime.utcnow()
    
    # Aggiorna ordine - ora può essere pagato (va nel carrello)
    update_data = {
        "status": "in_attesa_pagamento",
        "seller_confirmed_at": now,
        "status_history": order.get("status_history", []) + [{
            "status": "in_attesa_pagamento",
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
        "title": "Libro disponibile!",
        "message": f"📚 {order.get('book_titolo')}\n\nConcludi l'acquisto nel carrello",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "action": "open_cart",
        "data": {
            "order_id": order_id,
            "book_titolo": order.get("book_titolo"),
            "totale": order.get("totale_acquirente"),
            "open_cart": True
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "status": "in_attesa_pagamento",
        "message": "Disponibilità confermata! L'acquirente è stato notificato e il libro è nel suo carrello."
    }

@api_router.post("/orders/{order_id}/seller-reject")
async def seller_reject_order(order_id: str, user_id: str = Query(...), reason: str = Query("")):
    """Venditore rifiuta/annulla l'ordine - NON DISPONIBILE"""
    
    order = await db.orders.find_one({"id": order_id, "seller_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    current_status = order.get("status")
    if current_status not in ["pending_seller_confirmation", "in_attesa_conferma_venditore"]:
        raise HTTPException(status_code=400, detail="Ordine non può essere rifiutato")
    
    now = datetime.utcnow()
    seller_code = f"REB-{user_id[:6].upper()}"
    
    # Aggiorna ordine
    update_data = {
        "status": "annullato_non_disponibile",
        "cancelled_at": now,
        "cancellation_reason": reason or "Libro non disponibile",
        "status_history": order.get("status_history", []) + [{
            "status": "annullato_non_disponibile",
            "timestamp": now.isoformat(),
            "note": f"Rifiutato dal venditore: {reason or 'Libro non disponibile'}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Rimetti il listing come disponibile
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "available", "stato": "disponibile"}, "$unset": {"reserved_by": "", "order_id": ""}}
    )
    
    # Elimina la notifica del venditore
    await db.notifications.delete_many({
        "user_id": user_id,
        "order_id": order_id,
        "type": "seller_confirmation_request"
    })
    
    # Notifica all'acquirente
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "order_rejected_seller",
        "title": "Libro non disponibile",
        "message": f"Ci dispiace, l'utente {seller_code} non ha disponibilità per il testo:\n📚 {order.get('book_titolo')}",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    return {
        "success": True,
        "status": "annullato_non_disponibile",
        "message": "Ordine rifiutato. Il libro è tornato disponibile nel marketplace."
    }

@api_router.post("/orders/{order_id}/pay")
async def pay_order(order_id: str, user_id: str = Query(...)):
    """Simula il pagamento e mette i fondi in escrow"""
    
    order = await db.orders.find_one({"id": order_id, "buyer_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    current_status = order.get("status")
    if current_status not in ["pending_payment", "in_attesa_pagamento"]:
        raise HTTPException(status_code=400, detail=f"Ordine non in attesa di pagamento. Stato: {current_status}")
    
    # Recupera indirizzo cartolibreria
    bookstore = await db.bookstores.find_one({"id": order.get("bookstore_id")})
    bookstore_address = ""
    if bookstore:
        indirizzo = bookstore.get("indirizzo", "")
        citta = bookstore.get("citta", "")
        if indirizzo and citta:
            bookstore_address = f"{indirizzo}, {citta}"
        elif indirizzo:
            bookstore_address = indirizzo
    
    # Simula PaymentIntent di Stripe
    payment_intent_id = f"pi_mock_{uuid.uuid4().hex[:16]}"
    
    # Calcola deadline consegna (2 giorni lavorativi)
    from datetime import timedelta
    now = datetime.utcnow()
    # Semplificato: 2 giorni lavorativi = ~3 giorni calendar (considera weekend)
    delivery_deadline = now + timedelta(days=3)
    
    # Recupera il listing per le condizioni dettagliate e la foto
    listing = await db.listings.find_one({"id": order.get("listing_id")})
    condition_details = listing.get("condition_details", {}) if listing else {}
    listing_note = listing.get("note") or listing.get("descrizione") if listing else ""
    listing_photo = listing.get("foto_base64") or listing.get("photo_1") or "" if listing else ""
    include_foderazione = order.get("include_foderazione", False)
    
    # Calcola commissioni con la nuova logica
    prezzo_libro = order.get("prezzo_libro", 0)
    commissioni = calcola_commissioni(prezzo_libro, include_foderazione)
    
    # Formatta condizioni per le notifiche
    def get_label(val):
        if val == 0: return "Nessuna"
        if val <= 33: return "Poche"
        if val <= 66: return "Diverse"
        return "Molte"
    
    def get_usura_label(val):
        if val == 0: return "Nessuna"
        if val <= 33: return "Leggera"
        if val <= 66: return "Moderata"
        return "Elevata"
    
    def get_esercizi_label(val):
        if val == 0: return "Nessuno"
        if val <= 33: return "Pochi"
        if val <= 66: return "Alcuni"
        return "Molti"
    
    conditions_text = ""
    conditions_text += f"• Scritte a penna: {get_label(condition_details.get('penna', 0))}\n"
    conditions_text += f"• Scritte a matita: {get_label(condition_details.get('matita', 0))}\n"
    conditions_text += f"• Evidenziature: {get_label(condition_details.get('evidenziatore', 0))}\n"
    conditions_text += f"• Esercizi svolti: {get_esercizi_label(condition_details.get('esercizi', 0))}\n"
    conditions_text += f"• Usura pagine: {get_usura_label(condition_details.get('usura_pagine', 0))}\n"
    if listing_note:
        conditions_text += f"• Note venditore: {listing_note}\n"
    
    books_conditions = [{
        "title": order.get("book_titolo", ""),
        "conditions": conditions_text.strip()
    }]
    
    # Aggiorna ordine con nuovo stato e commissioni
    update_data = {
        "payment_intent_id": payment_intent_id,
        "payment_status": "paid",
        "status": "pagato_attesa_consegna",
        "paid_at": now,
        "delivery_deadline": delivery_deadline,
        "seller_delivery_deadline": delivery_deadline.isoformat(),
        # Salva commissioni calcolate
        "commissione_stripe": commissioni["commissione_stripe"],
        "commissione_piattaforma": commissioni["commissione_piattaforma"],
        "commissione_cartolibreria_libro": commissioni["commissione_cartolibreria_libro"],
        "commissione_cartolibreria_foderazione": commissioni["commissione_cartolibreria_foderazione"],
        "commissione_cartolibreria": commissioni["commissione_cartolibreria_totale"],
        "include_foderazione": include_foderazione,
        "costo_foderazione": commissioni["costo_foderazione"],
        "totale_acquirente": commissioni["totale_acquirente"],
        "netto_venditore": commissioni["netto_venditore"],
        "condition_details": condition_details,
        "conditions_text": conditions_text.strip(),
        "book_photo": listing_photo,
        "status_history": order.get("status_history", []) + [{
            "status": "pagato_attesa_consegna",
            "timestamp": now.isoformat(),
            "note": f"Pagamento ricevuto - Il venditore ha 2 giorni lavorativi per consegnare"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Aggiorna listing come riservato
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "reserved", "stato": "riservato", "reserved_by": user_id, "order_id": order_id}}
    )
    
    # Notifica al venditore con QR, condizioni e NO prezzo
    address_line = f"\n📍 {bookstore_address}" if bookstore_address else ""
    seller_notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "order_paid_deliver",
        "title": "🎉 VENDITA COMPLETATA!",
        "message": f"COMPLIMENTI!\n\n📚 {order.get('book_titolo')}\n\nAssicurati che il testo corrisponda alle condizioni descritte e consegnalo a partire dal giorno successivo entro 2 giorni lavorativi presso:\n🏪 {order.get('bookstore_name')}{address_line}\n\n📋 CONDIZIONI:\n{conditions_text}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "bookstore_address": bookstore_address,
        "book_titolo": order.get("book_titolo"),
        "data": {
            "order_code": order.get("order_code"),
            "books": [order.get("book_titolo")],
            "books_conditions": books_conditions,
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": True,
            "role": "seller"
        },
        "delivery_deadline": delivery_deadline.isoformat(),
        "show_qr": True,
        "requires_action": True,
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(seller_notification)
    
    # Notifica alla cartolibreria con condizioni, foto, NO QR, NO prezzo
    foderazione_text_bs = "\n\n📗 FODERAZIONE: ✅ RICHIESTA (€1.50)" if include_foderazione else ""
    
    bookstore_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": order.get("bookstore_id"),
        "user_id": f"bookstore_{order.get('bookstore_id')}",
        "type": "incoming_book_delivery",
        "title": "📦 LIBRO IN ARRIVO" + (" + 📗 FODERAZIONE" if include_foderazione else ""),
        "message": f"🔑 CODICE: {order.get('order_code')}\n\n📚 LIBRO: {order.get('book_titolo')}\n\n👤 VENDITORE: {order.get('seller_name')}\n🛒 ACQUIRENTE: {order.get('buyer_name')}{foderazione_text_bs}\n\n📋 CONDIZIONI:\n{conditions_text}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "book_titolo": order.get("book_titolo"),
        "seller_name": order.get("seller_name"),
        "buyer_name": order.get("buyer_name"),
        "books_conditions": books_conditions,
        "books_photos": [listing_photo] if listing_photo else [],
        "include_foderazione": include_foderazione,
        "show_qr": False,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_notification)
    
    # Notifica all'acquirente - SENZA QR (riceverà QR dopo consegna venditore)
    totale_acquirente = order.get("totale_acquirente", order.get("prezzo", 0))
    buyer_notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "order_pending",
        "title": "🎉 ACQUISTO CONFERMATO!",
        "message": f"📚 {order.get('book_titolo')}\n\n💰 Totale pagato: €{totale_acquirente:.2f}\n\nRiceverai una notifica con i dettagli del ritiro appena il venditore consegnerà il testo presso la cartolibreria:\n🏪 {order.get('bookstore_name')}\n📍 {bookstore_address if bookstore_address else ''}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "bookstore_address": bookstore_address,
        "book_titolo": order.get("book_titolo"),
        "prezzo": totale_acquirente,
        "data": {
            "order_code": order.get("order_code"),
            "books": [order.get("book_titolo")],
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": False,
            "awaiting_delivery": True
        },
        "show_qr": False,
        "awaiting_delivery": True,
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(buyer_notification)
    
    # ==========================================
    # MARCA COME USATA LA NOTIFICA "LIBRO DISPONIBILE"
    # Una volta pagato, il pulsante "Vai al carrello" non deve più apparire
    # ==========================================
    await db.notifications.update_many(
        {
            "user_id": order.get("buyer_id"),
            "order_id": order_id,
            "type": {"$in": ["seller_confirmation_request", "ready_for_payment", "book_available"]}
        },
        {"$set": {"used": True, "action_completed": True}}
    )
    
    return {
        "success": True,
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "status": "pagato_attesa_consegna",
        "delivery_deadline": delivery_deadline.isoformat(),
        "commissioni": commissioni,
        "message": "Pagamento completato! Il venditore ha 2 giorni lavorativi per consegnare il libro."
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
        "status": {"$in": ["pending_payment", "in_attesa_pagamento"]}
    }).to_list(50)
    
    if len(orders) != len(ids):
        # Cerca quali mancano per un messaggio di errore più utile
        found_ids = [o.get("id") for o in orders]
        missing = [i for i in ids if i not in found_ids]
        raise HTTPException(status_code=400, detail=f"Alcuni ordini non trovati o non pagabili: {missing}")
    
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
        
        # Recupera le condizioni dei libri dai listings
        books_conditions = []
        books_photos = []
        for order in group_orders:
            listing = await db.listings.find_one({"id": order.get("listing_id")})
            if listing:
                cond = listing.get("condition_details", {})
                note = listing.get("note", "")
                photo = listing.get("foto_base64") or listing.get("photo_1") or ""
                
                # Formatta condizioni
                def get_label(val):
                    if val == 0: return "Nessuna"
                    if val <= 33: return "Poche"
                    if val <= 66: return "Diverse"
                    return "Molte"
                
                cond_text = ""
                if cond.get("penna", 0) > 0:
                    cond_text += f"• Scritte a penna: {get_label(cond.get('penna', 0))}\n"
                else:
                    cond_text += "• Scritte a penna: Nessuna\n"
                if cond.get("matita", 0) > 0:
                    cond_text += f"• Scritte a matita: {get_label(cond.get('matita', 0))}\n"
                else:
                    cond_text += "• Scritte a matita: Nessuna\n"
                if cond.get("evidenziatore", 0) > 0:
                    cond_text += f"• Evidenziature: {get_label(cond.get('evidenziatore', 0))}\n"
                else:
                    cond_text += "• Evidenziature: Nessuna\n"
                if note:
                    cond_text += f"• Note: {note}\n"
                
                books_conditions.append({
                    "title": order.get("book_titolo", ""),
                    "conditions": cond_text.strip(),
                    "photo": photo
                })
                books_photos.append(photo)
        
        # Paga tutti gli ordini del gruppo
        for order in group_orders:
            payment_intent_id = f"pi_mock_{uuid.uuid4().hex[:16]}"
            update_data = {
                "payment_intent_id": payment_intent_id,
                "payment_status": "paid",
                "status": "pagato_attesa_consegna",
                "paid_at": now,
                "batch_code": batch_code if len(group_orders) > 1 else None,
                "batch_id": batch_id if len(group_orders) > 1 else None,
                "status_history": order.get("status_history", []) + [{
                    "status": "pagato_attesa_consegna",
                    "timestamp": now.isoformat(),
                    "note": f"Pagamento batch - codice condiviso: {batch_code}" if len(group_orders) > 1 else "Pagamento ricevuto"
                }]
            }
            await db.orders.update_one({"id": order.get("id")}, {"$set": update_data})
            
            # Riserva il listing
            await db.listings.update_one(
                {"id": order.get("listing_id")},
                {"$set": {"status": "reserved", "stato": "riservato", "reserved_by": user_id, "order_id": order.get("id")}}
            )
            paid_orders.append(order)
        
        # Notifica al venditore - UNA SOLA per tutto il gruppo
        # Formatta le condizioni dei libri per il venditore
        conditions_text = ""
        for bc in books_conditions:
            conditions_text += f"\n📚 {bc['title']}\n{bc['conditions']}\n"
        
        if len(group_orders) > 1:
            books_list = "\n".join([f"• {t}" for t in book_titles])
            seller_message = f"COMPLIMENTI! {len(group_orders)} LIBRI VENDUTI!\n\n{books_list}\n\nAssicurati che i testi corrispondano alle condizioni descritte e consegnali a partire dal giorno successivo entro 2 giorni lavorativi presso:\n🏪 {group_orders[0].get('bookstore_name')}\n\n🔑 CODICE RITIRO: {batch_code}\n\n📋 CONDIZIONI DESCRITTE:{conditions_text}"
        else:
            seller_message = f"COMPLIMENTI!\n📚 {book_titles[0]}\nÈ STATO VENDUTO!\n\nAssicurati che il testo corrisponda alle condizioni descritte e consegnalo a partire dal giorno successivo entro 2 giorni lavorativi presso:\n🏪 {group_orders[0].get('bookstore_name')}\n\n🔑 CODICE RITIRO: {batch_code}\n\n📋 CONDIZIONI DESCRITTE:{conditions_text}"
        
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
                "books_conditions": books_conditions,
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
        # L'acquirente viene avvisato che sarà notificato quando il venditore consegnerà
        totale_gruppo = sum(o.get("totale_acquirente", o.get("prezzo", 0)) for o in group_orders)
        if len(group_orders) > 1:
            buyer_message = f"ACQUISTO ANDATO A BUON FINE!\n\n📚 {len(group_orders)} LIBRI:\n{books_list}\n\n💰 Totale pagato: €{totale_gruppo:.2f}\n\nRiceverai una notifica con i dettagli del ritiro appena il venditore consegnerà i testi presso la cartolibreria:\n🏪 {group_orders[0].get('bookstore_name')}"
        else:
            totale_singolo = group_orders[0].get("totale_acquirente", group_orders[0].get("prezzo", 0))
            buyer_message = f"ACQUISTO ANDATO A BUON FINE!\n\n📚 {book_titles[0]}\n\n💰 Totale pagato: €{totale_singolo:.2f}\n\nRiceverai una notifica con i dettagli del ritiro appena il venditore consegnerà il testo presso la cartolibreria:\n🏪 {group_orders[0].get('bookstore_name')}"
        
        buyer_qr_notification = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "order_pending",
            "title": f"🎉 {'ACQUISTI CONFERMATI!' if len(group_orders) > 1 else 'ACQUISTO CONFERMATO!'}",
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
                "show_qr": False,
                "awaiting_delivery": True
            },
            "read": False,
            "persistent": True,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(buyer_qr_notification)
        
        # Notifica alla cartolibreria - con foto e descrizioni, senza QR e senza prezzo
        bookstore_conditions_text = ""
        for bc in books_conditions:
            bookstore_conditions_text += f"\n📚 {bc['title']}\n{bc['conditions']}\n"
        
        bookstore_notification = {
            "id": str(uuid.uuid4()),
            "bookstore_id": bookstore_id,
            "type": "incoming_order",
            "title": f"{'ORDINE MULTIPLO' if len(group_orders) > 1 else 'NUOVO ORDINE'} IN ARRIVO",
            "message": f"CODICE: {batch_code}\n\nVENDITORE: {group_orders[0].get('seller_name')}\nACQUIRENTE: {group_orders[0].get('buyer_name')}\n\n📋 DETTAGLI LIBRI:{bookstore_conditions_text}",
            "order_id": batch_id,
            "order_code": batch_code,
            "order_count": len(group_orders),
            "books_conditions": books_conditions,
            "books_photos": books_photos,
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
    
    # Accetta sia paid_escrow che pagato_attesa_consegna (italiano)
    if order.get("status") not in ["paid_escrow", "pagato_attesa_consegna"]:
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
    
    # Recupera i dettagli del listing per le condizioni
    listing = await db.listings.find_one({"id": order.get("listing_id")})
    condition_answers = listing.get("condition_answers") if listing else None
    condition_details = listing.get("condition_details") if listing else None
    listing_note = listing.get("note") or listing.get("descrizione") if listing else None
    
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
    
    # Notifica alla CARTOLIBRERIA per la consegna del venditore
    include_foderazione = order.get("include_foderazione", False)
    foderazione_text = "\n\n📦 FODERAZIONE RICHIESTA: ✅ SÌ (€1.50)" if include_foderazione else "\n\n📦 FODERAZIONE: ❌ Non richiesta"
    
    bookstore_delivery_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": order.get("bookstore_id"),
        "type": "seller_delivery",
        "title": "📦 CONSEGNA VENDITORE" + (" + 📗 FODERAZIONE" if include_foderazione else ""),
        "message": f"Il venditore sta per consegnare un libro.\n\n📚 LIBRO: {order.get('book_titolo')}\n\n👤 VENDITORE: {order.get('seller_name')}\n🛒 ACQUIRENTE: {order.get('buyer_name')}{foderazione_text}\n\n🔑 CODICE: {order.get('order_code')}\n\nVerifica il codice e le condizioni del libro prima di accettare la consegna.",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "book_title": order.get("book_titolo"),
        "book_isbn": order.get("book_isbn"),
        "seller_name": order.get("seller_name"),
        "buyer_name": order.get("buyer_name"),
        "include_foderazione": include_foderazione,
        "book_details": {
            "titolo": order.get("book_titolo"),
            "isbn": order.get("book_isbn"),
            "condition_answers": condition_answers,
            "condition_details": condition_details,
            "note": listing_note,
        },
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_delivery_notification)
    
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
    
    # Recupera le condizioni del libro dal listing
    listing = await db.listings.find_one({"id": order.get("listing_id")})
    cond = listing.get("condition_details", {}) if listing else {}
    note = listing.get("note", "") if listing else ""
    
    def get_label(val):
        if val == 0: return "Nessuna"
        if val <= 33: return "Poche"
        if val <= 66: return "Diverse"
        return "Molte"
    
    def get_usura_label(val):
        if val == 0: return "Nessuna"
        if val <= 33: return "Leggera"
        if val <= 66: return "Moderata"
        return "Elevata"
    
    def get_esercizi_label(val):
        if val == 0: return "Nessuno"
        if val <= 33: return "Pochi"
        if val <= 66: return "Alcuni"
        return "Molti"
    
    conditions_text = ""
    conditions_text += f"• Scritte a penna: {get_label(cond.get('penna', 0))}\n"
    conditions_text += f"• Scritte a matita: {get_label(cond.get('matita', 0))}\n"
    conditions_text += f"• Evidenziature: {get_label(cond.get('evidenziatore', 0))}\n"
    conditions_text += f"• Esercizi svolti: {get_esercizi_label(cond.get('esercizi', 0))}\n"
    conditions_text += f"• Usura pagine: {get_usura_label(cond.get('usura_pagine', 0))}\n"
    if note:
        conditions_text += f"• Note venditore: {note}\n"
    
    # Notifica all'acquirente con QR code e condizioni
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "order_qr_code",
        "title": "📦 LIBRO CONSEGNATO!",
        "message": f"📚 {order.get('book_titolo')}\n\nEffettua il ritiro presso:\n🏪 {order.get('bookstore_name')}\n\nMostra il QR code o il codice alla cartolibreria.\n\n📋 CONDIZIONI LIBRO:\n{conditions_text}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "data": {
            "order_code": order.get("order_code"),
            "books": [order.get("book_titolo")],
            "books_conditions": [{
                "title": order.get("book_titolo"),
                "conditions": conditions_text.strip()
            }],
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": True,
            "role": "buyer"
        },
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification)
    
    # Notifica al venditore con QR code (stesso codice dell'acquirente)
    seller_notification = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "order_qr_code",
        "title": "✅ LIBRO CONSEGNATO!",
        "message": f"📚 {order.get('book_titolo')}\n\nHai consegnato il libro presso:\n🏪 {order.get('bookstore_name')}\n\nL'acquirente può ritirarlo mostrando questo codice.\n\n🔑 CODICE: {order.get('order_code')}",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "data": {
            "order_code": order.get("order_code"),
            "books": [order.get("book_titolo")],
            "bookstore_name": order.get("bookstore_name"),
            "show_qr": True,
            "role": "seller"
        },
        "read": False,
        "persistent": True,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(seller_notification)
    
    return {
        "success": True,
        "status": "ready_for_pickup",
        "escrow_deadline": escrow_deadline.isoformat()
    }

@api_router.post("/orders/{order_id}/confirm-pickup")
async def confirm_pickup(order_id: str, user_id: str = Query(...)):
    """L'acquirente conferma il ritiro - inizia il periodo di 72h per eventuale reso"""
    
    order = await db.orders.find_one({"id": order_id, "buyer_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    if order.get("status") != "ready_for_pickup":
        raise HTTPException(status_code=400, detail="Il libro non è ancora pronto per il ritiro")
    
    now = datetime.utcnow()
    from datetime import timedelta
    return_deadline = now + timedelta(hours=RETURN_WINDOW_HOURS)
    
    # Aggiorna ordine a "picked_up" (non completato - 72h per reso)
    update_data = {
        "status": "picked_up",
        "picked_up_at": now,
        "return_deadline": return_deadline,
        "status_history": order.get("status_history", []) + [{
            "status": "picked_up",
            "timestamp": now.isoformat(),
            "note": "Ritiro confermato dall'acquirente - Inizio periodo reso 72h"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Aggiorna listing come venduto
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "sold", "sold_at": now, "sold_to": user_id}}
    )
    
    # Notifica all'acquirente sulla finestra reso
    notification_buyer = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "pickup_confirmed",
        "title": "Libro ritirato!",
        "message": f"Hai ritirato:\n📚 {order.get('book_titolo')}\n\nHai 3 giorni per richiedere il reso, in \"I miei scambi\" nella sezione Profilo, solo ed esclusivamente se la descrizione delle condizioni inserita non corrisponde a quelle reali del libro, già sottoposto al controllo nei punti di ritiro durante la consegna.",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_buyer)
    
    # Notifica al venditore
    notification_seller = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "book_picked_up",
        "title": "Libro ritirato!",
        "message": f"L'acquirente ha ritirato: {order.get('book_titolo')}\n\nRiceverai il pagamento tra 3/5 giorni lavorativi se non verranno trovate evidenti differenze nelle descrizioni dall'acquirente.",
        "order_id": order_id,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_seller)
    
    return {
        "success": True,
        "status": "picked_up",
        "return_deadline": return_deadline.isoformat(),
        "message": "Ritiro confermato! Hai 3 giorni per richiedere il reso in \"I miei scambi\" (Profilo) solo se le condizioni non corrispondono."
    }

@api_router.get("/user-orders/{user_id}")
async def get_user_orders(user_id: str):
    """Ottieni tutti gli ordini di un utente (come acquirente o venditore)"""
    
    orders = await db.orders.find({
        "$or": [{"buyer_id": user_id}, {"seller_id": user_id}]
    }).sort("created_at", -1).to_list(100)
    
    for order in orders:
        order.pop('_id', None)
        order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
        order["is_buyer"] = order.get("buyer_id") == user_id
        order["is_seller"] = order.get("seller_id") == user_id
    
    return {"orders": orders, "count": len(orders)}

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

# ============== SISTEMA TIMER E CHECK AUTOMATICI ==============

async def check_order_timeouts(order_id: str):
    """
    Verifica tutti i timeout di un ordine (on-demand):
    1. Timer 24h conferma venditore
    2. Timer 2 giorni consegna
    3. Timer 3 giorni reso
    """
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return None
    
    now = datetime.utcnow()
    status = order.get("status")
    
    # 1. Check timeout 24h conferma venditore
    if status in ["in_attesa_conferma_venditore", "pending_seller_confirmation"]:
        deadline = order.get("seller_confirmation_deadline")
        if deadline:
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
            if now > deadline:
                # Timeout! Annulla ordine
                seller_code = f"REB-{order.get('seller_id', '')[:6].upper()}"
                update_data = {
                    "status": "annullato_timeout",
                    "cancelled_at": now,
                    "cancellation_reason": "Nessuna risposta dal venditore entro 24h",
                    "status_history": order.get("status_history", []) + [{
                        "status": "annullato_timeout",
                        "timestamp": now.isoformat(),
                        "note": "Timeout 24h - Nessuna risposta dal venditore"
                    }]
                }
                await db.orders.update_one({"id": order_id}, {"$set": update_data})
                
                # Rimetti listing disponibile
                await db.listings.update_one(
                    {"id": order.get("listing_id")},
                    {"$set": {"status": "available", "stato": "disponibile"}, "$unset": {"reserved_by": "", "order_id": ""}}
                )
                
                # Notifica acquirente
                notification_buyer = {
                    "id": str(uuid.uuid4()),
                    "user_id": order.get("buyer_id"),
                    "type": "order_timeout",
                    "title": "Richiesta scaduta",
                    "message": f"Ci dispiace, sono trascorse 24 ore senza conferma della disponibilità del testo:\n📚 {order.get('book_titolo')}\n\nLa richiesta verrà annullata.\nÈ possibile formularla nuovamente.",
                    "order_id": order_id,
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(notification_buyer)
                
                # Notifica venditore
                notification_seller = {
                    "id": str(uuid.uuid4()),
                    "user_id": order.get("seller_id"),
                    "type": "order_timeout_seller",
                    "title": "Richiesta scaduta",
                    "message": f"Non hai confermato la disponibilità del testo:\n📚 {order.get('book_titolo')}\n\nLa richiesta è stata annullata automaticamente.",
                    "order_id": order_id,
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(notification_seller)
                
                # Elimina notifiche pendenti del venditore
                await db.notifications.delete_many({
                    "user_id": order.get("seller_id"),
                    "order_id": order_id,
                    "type": "seller_confirmation_request"
                })
                
                order["status"] = "annullato_timeout"
                return order
    
    # 2. Check timeout 2 giorni consegna
    if status in ["pagato_attesa_consegna", "paid_escrow"]:
        deadline = order.get("delivery_deadline")
        if deadline:
            if isinstance(deadline, str):
                deadline = datetime.fromisoformat(deadline.replace('Z', '+00:00'))
            if now > deadline:
                # Timeout! Annulla e rimborsa
                update_data = {
                    "status": "annullato_mancata_consegna",
                    "payment_status": "refunded",
                    "cancelled_at": now,
                    "cancellation_reason": "Il venditore non ha consegnato entro 2 giorni lavorativi",
                    "status_history": order.get("status_history", []) + [{
                        "status": "annullato_mancata_consegna",
                        "timestamp": now.isoformat(),
                        "note": "Timeout consegna - Rimborso automatico all'acquirente"
                    }]
                }
                await db.orders.update_one({"id": order_id}, {"$set": update_data})
                
                # Rimetti listing disponibile
                await db.listings.update_one(
                    {"id": order.get("listing_id")},
                    {"$set": {"status": "available", "stato": "disponibile"}, "$unset": {"reserved_by": "", "order_id": ""}}
                )
                
                # Notifica acquirente
                notification_buyer = {
                    "id": str(uuid.uuid4()),
                    "user_id": order.get("buyer_id"),
                    "type": "order_delivery_timeout",
                    "title": "Ordine annullato - Rimborso",
                    "message": f"Il venditore non ha consegnato il libro:\n📚 {order.get('book_titolo')}\n\nentro 2 giorni lavorativi.\n\nI fondi di €{order.get('totale_acquirente', 0):.2f} verranno riaccreditati automaticamente.",
                    "order_id": order_id,
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(notification_buyer)
                
                # Notifica venditore
                notification_seller = {
                    "id": str(uuid.uuid4()),
                    "user_id": order.get("seller_id"),
                    "type": "order_delivery_timeout_seller",
                    "title": "Ordine annullato",
                    "message": f"Non hai consegnato il libro:\n📚 {order.get('book_titolo')}\n\nentro 2 giorni lavorativi.\n\nL'ordine è stato annullato e l'acquirente rimborsato.",
                    "order_id": order_id,
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(notification_seller)
                
                order["status"] = "annullato_mancata_consegna"
                order["payment_status"] = "refunded"
                return order
    
    # 3. Check timeout 3 giorni reso (già implementato sotto)
    if status == "picked_up":
        return await check_and_complete_order_if_expired(order_id)
    
    return order

@api_router.get("/orders/{order_id}/check-timeouts")
async def check_order_timeouts_endpoint(order_id: str, user_id: str = Query(...)):
    """Endpoint per forzare il check dei timeout di un ordine"""
    order = await check_order_timeouts(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    order.pop('_id', None)
    order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
    
    return {
        "order_id": order_id,
        "status": order.get("status"),
        "status_label": order.get("status_label"),
        "checked_at": datetime.utcnow().isoformat()
    }

# ============== SISTEMA RESI ==============

async def check_and_complete_order_if_expired(order_id: str):
    """
    Verifica se il periodo di reso (72h) è scaduto e completa l'ordine automaticamente.
    Chiamata on-demand quando l'utente accede ai dettagli ordine.
    """
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return None
    
    # Solo gli ordini in stato "picked_up" possono scadere
    if order.get("status") != "picked_up":
        return order
    
    return_deadline = order.get("return_deadline")
    if not return_deadline:
        return order
    
    # Converte se stringa
    if isinstance(return_deadline, str):
        return_deadline = datetime.fromisoformat(return_deadline.replace('Z', '+00:00'))
    
    now = datetime.utcnow()
    
    # Se la deadline è passata, completa l'ordine
    if now > return_deadline:
        update_data = {
            "status": "completed",
            "payment_status": "released",
            "completed_at": now,
            "status_history": order.get("status_history", []) + [{
                "status": "completed",
                "timestamp": now.isoformat(),
                "note": f"Periodo reso scaduto - Pagamento di €{order.get('netto_venditore', 0):.2f} rilasciato al venditore"
            }]
        }
        
        await db.orders.update_one({"id": order_id}, {"$set": update_data})
        
        # =============== ACCREDITO CARTOLIBRERIA ===============
        # Aggiorna credito cartolibreria ad operazione conclusa
        bookstore_id = order.get("bookstore_id")
        if bookstore_id:
            commissione_libro = order.get("commissione_cartolibreria_libro", 0)
            commissione_foderazione = order.get("commissione_cartolibreria_foderazione", 0)
            commissione_totale = order.get("commissione_cartolibreria", 0)
            
            await db.bookstores.update_one(
                {"id": bookstore_id},
                {
                    "$inc": {
                        "credito_commissioni": commissione_libro,
                        "credito_foderazione": commissione_foderazione,
                        "credito_totale": commissione_totale
                    }
                }
            )
            
            # Crea log del movimento credito
            credit_log = {
                "id": str(uuid.uuid4()),
                "bookstore_id": bookstore_id,
                "order_id": order_id,
                "order_code": order.get("order_code"),
                "book_titolo": order.get("book_titolo"),
                "type": "accredito",
                "commissione_libro": commissione_libro,
                "commissione_foderazione": commissione_foderazione,
                "totale": commissione_totale,
                "created_at": now.isoformat()
            }
            await db.bookstore_credit_logs.insert_one(credit_log)
            
            # Notifica cartolibreria dell'accredito
            bookstore_notification = {
                "id": str(uuid.uuid4()),
                "bookstore_id": bookstore_id,
                "type": "credit_added",
                "title": "💰 Commissione accreditata!",
                "message": f"Ordine {order.get('order_code')} completato!\n\n📚 {order.get('book_titolo')}\n\n💵 Commissione libro: €{commissione_libro:.2f}\n📦 Foderazione: €{commissione_foderazione:.2f}\n\n✅ Totale accreditato: €{commissione_totale:.2f}",
                "order_id": order_id,
                "order_code": order.get("order_code"),
                "commissione_libro": commissione_libro,
                "commissione_foderazione": commissione_foderazione,
                "commissione_totale": commissione_totale,
                "read": False,
                "created_at": now.isoformat()
            }
            await db.bookstore_notifications.insert_one(bookstore_notification)
        # ========================================================
        
        # =============== ACCREDITO PIATTAFORMA/ADMIN ===============
        # Calcola e accredita la commissione piattaforma
        prezzo_libro = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        commissioni_calc = calcola_commissioni(prezzo_libro, include_fod)
        commissione_piattaforma = commissioni_calc["commissione_piattaforma"]
        
        # Aggiorna credito piattaforma
        await db.platform_stats.update_one(
            {"id": "main"},
            {
                "$inc": {
                    "credito_totale": commissione_piattaforma,
                    "ordini_completati": 1
                },
                "$setOnInsert": {"id": "main", "created_at": now.isoformat()}
            },
            upsert=True
        )
        
        # Log movimento credito piattaforma
        platform_credit_log = {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "type": "accredito",
            "commissione_piattaforma": commissione_piattaforma,
            "prezzo_libro": prezzo_libro,
            "include_foderazione": include_fod,
            "created_at": now.isoformat()
        }
        await db.platform_credit_logs.insert_one(platform_credit_log)
        # ===========================================================
        
        # Notifica al venditore
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "payment_released",
            "title": "FONDI IN ARRIVO!",
            "message": f"Il periodo di reso è scaduto senza reclami.\n\nFONDI IN ARRIVO PER:\n{order.get('book_titolo')}\n\nImporto: €{order.get('netto_venditore', 0):.2f}",
            "order_id": order_id,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification)
        
        # Aggiorna ordine in memoria
        order["status"] = "completed"
        order["payment_status"] = "released"
        order["completed_at"] = now
    
    return order

@api_router.post("/orders/{order_id}/request-return")
async def request_return(order_id: str, user_id: str = Query(...), reason: str = Query(...)):
    """
    L'acquirente richiede un reso.
    Deve specificare la motivazione (incongruenza tra descrizione e condizioni reali).
    """
    if not reason or len(reason.strip()) < 10:
        raise HTTPException(status_code=400, detail="La motivazione deve essere di almeno 10 caratteri")
    
    order = await db.orders.find_one({"id": order_id, "buyer_id": user_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    # Verifica stato ordine - permetti anche "ritirato" e "pronto_per_ritiro" per test
    allowed_states = ["picked_up", "ritirato", "pronto_per_ritiro", "ready_for_pickup"]
    if order.get("status") not in allowed_states:
        if order.get("status") == "completed":
            raise HTTPException(status_code=400, detail="Il periodo per richiedere il reso è scaduto")
        raise HTTPException(status_code=400, detail=f"Non puoi richiedere un reso per questo ordine (stato: {order.get('status')})")
    
    # Verifica deadline reso (se presente)
    return_deadline = order.get("return_deadline")
    if return_deadline:
        if isinstance(return_deadline, str):
            return_deadline = datetime.fromisoformat(return_deadline.replace('Z', '+00:00'))
        if datetime.utcnow() > return_deadline:
            # Completa l'ordine se scaduto
            await check_and_complete_order_if_expired(order_id)
            raise HTTPException(status_code=400, detail="Il periodo per richiedere il reso è scaduto (72 ore dal ritiro)")
    
    now = datetime.utcnow()
    reason_text = reason.strip()
    
    # Aggiorna ordine a "in_verifica_reso"
    update_data = {
        "status": "in_verifica_reso",
        "return_requested_at": now,
        "return_reason": reason_text,
        "status_history": order.get("status_history", []) + [{
            "status": "in_verifica_reso",
            "timestamp": now.isoformat(),
            "note": f"Richiesta reso: {reason_text}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Recupera i dettagli del listing per la scheda libro dettagliata
    listing = await db.listings.find_one({"id": order.get("listing_id")})
    listing_details = {}
    condition_details_text = "Non disponibili"
    
    if listing:
        listing_details = {
            "condizioni": listing.get("condizioni") or listing.get("condizione") or "Non specificate",
            "descrizione": listing.get("descrizione", "Nessuna descrizione"),
            "foto_base64": listing.get("foto_base64"),
            "prezzo_vendita": listing.get("prezzo_vendita"),
        }
        
        # Estrai dettagli condizioni specifiche
        cond = listing.get("condition_details", {})
        if cond:
            details_lines = []
            
            # Scritte a penna
            penna_pct = cond.get("penna", 0)
            if penna_pct > 0:
                details_lines.append(f"✏️ Scritte a penna: {penna_pct:.0f}%")
            else:
                details_lines.append("✏️ Scritte a penna: Nessuna")
            
            # Scritte a matita
            matita_pct = cond.get("matita", 0)
            if matita_pct > 0:
                details_lines.append(f"✎ Scritte a matita: {matita_pct:.0f}%")
            else:
                details_lines.append("✎ Scritte a matita: Nessuna")
            
            # Evidenziature
            evidenz_pct = cond.get("evidenziatore", 0)
            if evidenz_pct > 0:
                details_lines.append(f"🖍️ Evidenziature: {evidenz_pct:.0f}%")
            else:
                details_lines.append("🖍️ Evidenziature: Nessuna")
            
            # Usura libro
            usura_pct = cond.get("usura_libro", 0)
            if usura_pct > 0:
                details_lines.append(f"📖 Usura libro: {usura_pct:.0f}%")
            else:
                details_lines.append("📖 Usura libro: Come nuovo")
            
            # Esercizi svolti
            esercizi_penna = cond.get("esercizi_penna", False)
            esercizi_matita = cond.get("esercizi_matita", False)
            esercizi_qty = cond.get("esercizi_quantita", 0)
            
            if esercizi_penna or esercizi_matita:
                esercizi_tipo = []
                if esercizi_penna:
                    esercizi_tipo.append("a penna")
                if esercizi_matita:
                    esercizi_tipo.append("a matita")
                details_lines.append(f"📝 Esercizi svolti: Sì ({', '.join(esercizi_tipo)}) - {esercizi_qty} pagine")
            else:
                details_lines.append("📝 Esercizi svolti: No")
            
            condition_details_text = "\n".join(details_lines)
    
    # Notifica alla cartolibreria - SALVA IN bookstore_notifications
    bookstore_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": order.get("bookstore_id"),
        "type": "return_request",
        "title": "🔄 Richiesta reso da verificare",
        "message": f"Nuovo reso da verificare:\n\n📚 LIBRO:\n{order.get('book_titolo')}\n\n👤 ACQUIRENTE: {order.get('buyer_name')}\n👤 VENDITORE: {order.get('seller_name')}\n\n⚠️ MOTIVAZIONE RESO:\n\"{reason_text}\"\n\n📋 CONDIZIONI GENERALI:\n{listing_details.get('condizioni', 'Non specificate')}\n\n🔍 DETTAGLI CONDIZIONI DICHIARATE:\n{condition_details_text}\n\n📝 NOTE VENDITORE:\n{listing_details.get('descrizione', 'Nessuna')}\n\n💰 Prezzo vendita: €{listing_details.get('prezzo_vendita', 0):.2f}\n\nVerifica il libro e approva o rifiuta il reso.",
        "order_id": order_id,
        "order_code": order.get("order_code"),
        "return_reason": reason_text,
        "book_details": {
            "titolo": order.get("book_titolo"),
            "isbn": order.get("book_isbn"),
            "autore": order.get("book_autore"),
            "condizioni": listing_details.get("condizioni"),
            "descrizione": listing_details.get("descrizione"),
            "note": listing_details.get("note"),
            "condition_details": listing.get("condition_details") if listing else None,
            "condition_answers": listing.get("condition_answers") if listing else None,
            "foto": listing_details.get("foto_base64"),
            "prezzo": listing_details.get("prezzo_vendita"),
        },
        "buyer_name": order.get("buyer_name"),
        "seller_name": order.get("seller_name"),
        "requires_action": True,
        "action_type": "verify_return",
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_notification)
    
    # Notifica al venditore CON LA MOTIVAZIONE
    bookstore_name_clean = order.get('bookstore_name', 'la cartolibreria')
    # Evita duplicati come "La cartolibreria Cartolibreria NiCa"
    if bookstore_name_clean.lower().startswith('cartolibreria'):
        bookstore_prefix = ""
    else:
        bookstore_prefix = "La cartolibreria "
    notification_seller = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "return_requested",
        "title": "Richiesta reso ricevuta",
        "message": f"L'acquirente ha richiesto un reso per:\n📚 {order.get('book_titolo')}\n\n⚠️ Motivazione dell'acquirente:\n\"{reason_text}\"\n\n{bookstore_prefix}{bookstore_name_clean} verificherà il libro e deciderà se approvare il reso.",
        "order_id": order_id,
        "return_reason": reason_text,
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_seller)
    
    return {
        "success": True,
        "status": "in_verifica_reso",
        "message": "Richiesta reso inviata. La cartolibreria verificherà il libro."
    }

@api_router.post("/orders/{order_id}/verify-return")
async def verify_return(
    order_id: str, 
    bookstore_id: str = Query(...),
    accepted: bool = Query(...),
    notes: str = Query("")
):
    """
    La cartolibreria verifica e accetta/rifiuta il reso.
    """
    order = await db.orders.find_one({"id": order_id, "bookstore_id": bookstore_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato per questa cartolibreria")
    
    if order.get("status") != "in_verifica_reso":
        raise HTTPException(status_code=400, detail="Questo ordine non ha una richiesta reso in attesa")
    
    now = datetime.utcnow()
    
    if accepted:
        # RESO ACCETTATO - Rimborso acquirente
        update_data = {
            "status": "reso_accettato",
            "payment_status": "refunded",
            "return_verified_at": now,
            "return_verified_by": bookstore_id,
            "return_notes": notes or "Reso accettato - Libro non conforme alla descrizione",
            "status_history": order.get("status_history", []) + [{
                "status": "reso_accettato",
                "timestamp": now.isoformat(),
                "note": f"Reso accettato dalla cartolibreria. {notes}"
            }]
        }
        
        await db.orders.update_one({"id": order_id}, {"$set": update_data})
        
        # Rimetti il listing disponibile per il venditore
        await db.listings.update_one(
            {"id": order.get("listing_id")},
            {"$set": {"status": "active", "sold_at": None, "sold_to": None}}
        )
        
        # Notifica acquirente - RESO ACCETTATO
        notification_buyer = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("buyer_id"),
            "type": "return_accepted",
            "title": "Reso accettato - Pagamento annullato",
            "message": f"✅ Il reso per il libro:\n📚 \"{order.get('book_titolo')}\"\n\nè stato ACCETTATO dalla cartolibreria.\n\n💰 Il pagamento di €{order.get('totale_acquirente', 0):.2f} è stato annullato e rimborsato.",
            "order_id": order_id,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_buyer)
        
        # Notifica venditore - RESO ACCETTATO
        return_reason = order.get("return_reason", "Non specificato")
        bookstore_name = order.get("bookstore_name", "la cartolibreria")
        order_code = order.get("code", "")
        notification_seller = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "return_accepted",
            "title": "Reso del libro accettato - Acquisto annullato",
            "message": f"⚠️ Il reso per il libro:\n📚 \"{order.get('book_titolo')}\"\n\nè stato ACCETTATO.\n\n📝 Motivazione acquirente:\n\"{return_reason}\"\n\nL'acquisto è annullato. Il libro è tornato disponibile nel tuo inventario.\n\nRecati presso {bookstore_name} per ritirare il libro.",
            "order_id": order_id,
            "order_code": order_code,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_seller)
        
        return {
            "success": True,
            "status": "reso_accettato",
            "message": "Reso accettato. L'acquirente riceverà il rimborso."
        }
    else:
        # RESO RIFIUTATO - Pagamento al venditore
        update_data = {
            "status": "reso_rifiutato",
            "payment_status": "released",
            "completed_at": now,
            "return_verified_at": now,
            "return_verified_by": bookstore_id,
            "return_notes": notes or "Reso rifiutato - Libro conforme alla descrizione",
            "status_history": order.get("status_history", []) + [{
                "status": "reso_rifiutato",
                "timestamp": now.isoformat(),
                "note": f"Reso rifiutato dalla cartolibreria. {notes}"
            }, {
                "status": "completed",
                "timestamp": now.isoformat(),
                "note": f"Pagamento di €{order.get('netto_venditore', 0):.2f} rilasciato al venditore"
            }]
        }
        
        await db.orders.update_one({"id": order_id}, {"$set": update_data})
        
        # =============== ACCREDITO CARTOLIBRERIA (reso rifiutato = ordine completo) ===============
        commissione_libro = order.get("commissione_cartolibreria_libro", 0)
        commissione_foderazione = order.get("commissione_cartolibreria_foderazione", 0)
        commissione_totale = order.get("commissione_cartolibreria", 0)
        
        await db.bookstores.update_one(
            {"id": bookstore_id},
            {
                "$inc": {
                    "credito_commissioni": commissione_libro,
                    "credito_foderazione": commissione_foderazione,
                    "credito_totale": commissione_totale
                }
            }
        )
        
        # Log movimento credito
        credit_log = {
            "id": str(uuid.uuid4()),
            "bookstore_id": bookstore_id,
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "type": "accredito",
            "commissione_libro": commissione_libro,
            "commissione_foderazione": commissione_foderazione,
            "totale": commissione_totale,
            "note": "Reso rifiutato - Ordine completato",
            "created_at": now.isoformat()
        }
        await db.bookstore_credit_logs.insert_one(credit_log)
        # =========================================================================================
        
        # =============== ACCREDITO PIATTAFORMA/ADMIN (reso rifiutato) ===============
        prezzo_libro = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        commissioni_calc = calcola_commissioni(prezzo_libro, include_fod)
        commissione_piattaforma = commissioni_calc["commissione_piattaforma"]
        
        await db.platform_stats.update_one(
            {"id": "main"},
            {
                "$inc": {
                    "credito_totale": commissione_piattaforma,
                    "ordini_completati": 1
                },
                "$setOnInsert": {"id": "main", "created_at": now.isoformat()}
            },
            upsert=True
        )
        
        platform_credit_log = {
            "id": str(uuid.uuid4()),
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "type": "accredito",
            "commissione_piattaforma": commissione_piattaforma,
            "prezzo_libro": prezzo_libro,
            "include_foderazione": include_fod,
            "note": "Reso rifiutato - Ordine completato",
            "created_at": now.isoformat()
        }
        await db.platform_credit_logs.insert_one(platform_credit_log)
        # ===========================================================================
        
        # Notifica acquirente
        notification_buyer = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("buyer_id"),
            "type": "return_rejected",
            "title": "Reso rifiutato",
            "message": f"Il reso per '{order.get('book_titolo')}' è stato rifiutato.\n\nMotivo: Il libro risulta conforme alla descrizione.",
            "order_id": order_id,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_buyer)
        
        # Notifica venditore
        notification_seller = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "payment_released",
            "title": "FONDI IN ARRIVO!",
            "message": f"Reso rifiutato - libro conforme.\n\nFONDI IN ARRIVO PER:\n{order.get('book_titolo')}\n\nImporto: €{order.get('netto_venditore', 0):.2f}",
            "order_id": order_id,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_seller)
        
        # Notifica cartolibreria dell'accredito
        bookstore_notification = {
            "id": str(uuid.uuid4()),
            "bookstore_id": bookstore_id,
            "type": "credit_added",
            "title": "💰 Commissione accreditata!",
            "message": f"Ordine {order.get('order_code')} completato (reso rifiutato)!\n\n📚 {order.get('book_titolo')}\n\n💵 Commissione libro: €{commissione_libro:.2f}\n📦 Foderazione: €{commissione_foderazione:.2f}\n\n✅ Totale accreditato: €{commissione_totale:.2f}",
            "order_id": order_id,
            "commissione_libro": commissione_libro,
            "commissione_foderazione": commissione_foderazione,
            "commissione_totale": commissione_totale,
            "read": False,
            "created_at": now.isoformat()
        }
        await db.bookstore_notifications.insert_one(bookstore_notification)
        
        return {
            "success": True,
            "status": "reso_rifiutato",
            "message": "Reso rifiutato. Il venditore riceverà il pagamento."
        }

@api_router.get("/bookstore/{bookstore_id}/pending-returns")
async def get_pending_returns(bookstore_id: str):
    """Ottiene tutti i resi in attesa di verifica per una cartolibreria"""
    
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": "in_verifica_reso"
    }).sort("return_requested_at", -1).to_list(100)
    
    for order in orders:
        order.pop('_id', None)
        order["status_label"] = ORDER_STATES.get(order.get("status"), order.get("status"))
    
    return {"returns": orders, "count": len(orders)}

@api_router.get("/orders/{order_id}/check-return-status")
async def check_return_status(order_id: str, user_id: str = Query(...)):
    """
    Verifica lo stato del reso per un ordine.
    Controlla anche se la deadline è scaduta (on-demand).
    """
    order = await db.orders.find_one({
        "id": order_id,
        "$or": [{"buyer_id": user_id}, {"seller_id": user_id}]
    })
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    # Check e completa se scaduto
    order = await check_and_complete_order_if_expired(order_id)
    
    order.pop('_id', None)
    
    # Calcola tempo rimanente per reso
    return_time_remaining = None
    can_request_return = False
    
    if order.get("status") == "picked_up":
        return_deadline = order.get("return_deadline")
        if return_deadline:
            if isinstance(return_deadline, str):
                return_deadline = datetime.fromisoformat(return_deadline.replace('Z', '+00:00'))
            remaining = return_deadline - datetime.utcnow()
            if remaining.total_seconds() > 0:
                hours = int(remaining.total_seconds() // 3600)
                minutes = int((remaining.total_seconds() % 3600) // 60)
                return_time_remaining = f"{hours}h {minutes}m"
                can_request_return = True
    
    return {
        "order_id": order_id,
        "status": order.get("status"),
        "status_label": ORDER_STATES.get(order.get("status"), order.get("status")),
        "can_request_return": can_request_return,
        "return_time_remaining": return_time_remaining,
        "return_deadline": order.get("return_deadline"),
        "return_reason": order.get("return_reason"),
        "return_notes": order.get("return_notes"),
        "is_buyer": order.get("buyer_id") == user_id
    }


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
    
    # Può essere annullato solo se in questi stati
    cancellable_statuses = [
        "pending_seller_confirmation", 
        "pending_payment", 
        "paid_escrow",
        "in_attesa_pagamento",  # Ordini nel carrello
        "in_attesa_conferma"    # In attesa conferma venditore
    ]
    
    if order.get("status") not in cancellable_statuses:
        raise HTTPException(status_code=400, detail="Ordine non annullabile in questo stato")
    
    now = datetime.utcnow()
    is_refund = order.get("status") == "paid_escrow"
    is_buyer = order.get("buyer_id") == user_id
    
    update_data = {
        "status": "refunded" if is_refund else "cancelled",
        "payment_status": "refunded" if is_refund else "cancelled",
        "status_history": order.get("status_history", []) + [{
            "status": "refunded" if is_refund else "cancelled",
            "timestamp": now.isoformat(),
            "note": f"Annullato da {'acquirente' if is_buyer else 'venditore'}. {reason}"
        }]
    }
    
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    
    # Ripristina listing
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "available", "stato": "disponibile"}, "$unset": {"reserved_by": "", "order_id": ""}}
    )
    
    # Notifica all'altra parte
    other_user_id = order.get("seller_id") if is_buyer else order.get("buyer_id")
    
    if is_buyer:
        # Acquirente annulla - notifica al venditore
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": other_user_id,
            "type": "order_cancelled_by_buyer",
            "title": "Acquisto annullato dall'acquirente",
            "message": f"L'acquirente non è più interessato all'acquisto del libro:\n\n📚 {order.get('book_titolo')}\n\nIl libro è tornato disponibile nel tuo inventario.",
            "order_id": order_id,
            "book_titolo": order.get("book_titolo"),
            "read": False,
            "created_at": now.isoformat()
        }
    else:
        # Venditore annulla
        notification = {
            "id": str(uuid.uuid4()),
            "user_id": other_user_id,
            "type": "order_cancelled",
            "title": "Ordine annullato dal venditore",
            "message": f"Il venditore ha annullato l'ordine per:\n\n📚 {order.get('book_titolo')}" + ("\n\nIl rimborso è stato elaborato." if is_refund else ""),
            "order_id": order_id,
            "book_titolo": order.get("book_titolo"),
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
    
    # Verifica admin
    admin = await db.users.find_one({"id": admin_id})
    if not admin or not admin.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    requests = await db.bookstore_requests.find().sort("created_at", -1).to_list(100)
    
    for req in requests:
        req.pop('_id', None)
    
    return {"requests": requests}

# ============ ADMIN LOGIN & DASHBOARD ============

class AdminLogin(BaseModel):
    email: str
    password: str

@api_router.post("/admin/login")
async def admin_login(data: AdminLogin):
    """Login admin"""
    user = await db.users.find_one({"email": data.email.lower()})
    
    if not user:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    # Verifica password con hash
    import hashlib
    password_hash = hashlib.sha256(data.password.encode()).hexdigest()
    stored_hash = user.get("password_hash", "")
    
    if password_hash != stored_hash:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    return {
        "success": True,
        "user_id": user.get("id"),
        "email": user.get("email"),
        "nome": user.get("nome"),
        "is_admin": True
    }

@api_router.get("/admin/stats")
async def get_admin_stats(admin_id: str = Query(...)):
    """Admin: statistiche generali con guadagni piattaforma"""
    admin = await db.users.find_one({"id": admin_id})
    if not admin or not admin.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    # Conta utenti
    total_users = await db.users.count_documents({})
    
    # Conta cartolibrerie
    total_bookstores = await db.bookstores.count_documents({})
    
    # Conta ordini
    total_orders = await db.orders.count_documents({})
    orders_completed = await db.orders.count_documents({"status": "completed"})
    orders_pending = await db.orders.count_documents({"status": {"$in": ["in_attesa_pagamento", "paid_escrow", "delivering_to_bookstore", "pagato_attesa_consegna"]}})
    
    # Conta listings
    total_listings = await db.listings.count_documents({})
    active_listings = await db.listings.count_documents({"stato": "disponibile"})
    
    # Richieste cartolibrerie pending
    pending_requests = await db.bookstore_requests.count_documents({"status": "pending"})
    
    # Reports non risolti
    pending_reports = await db.reports.count_documents({"status": "pending"})
    
    # Calcolo guadagni piattaforma
    from datetime import timedelta
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Ordini completati oggi
    orders_today = await db.orders.find({
        "status": "completed",
        "completed_at": {"$gte": today_start.isoformat()}
    }).to_list(1000)
    
    # Ordini completati questo mese
    orders_month = await db.orders.find({
        "status": "completed",
        "completed_at": {"$gte": month_start.isoformat()}
    }).to_list(10000)
    
    # Calcola guadagni piattaforma (10% libro / 2 - proporzione Stripe)
    guadagno_oggi = 0
    guadagno_mese = 0
    foderazione_oggi = 0
    foderazione_mese = 0
    
    for order in orders_today:
        prezzo = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        comm = calcola_commissioni(prezzo, include_fod)
        guadagno_oggi += comm["commissione_piattaforma"]
        if include_fod:
            foderazione_oggi += 1
    
    for order in orders_month:
        prezzo = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        comm = calcola_commissioni(prezzo, include_fod)
        guadagno_mese += comm["commissione_piattaforma"]
        if include_fod:
            foderazione_mese += 1
    
    # Recupera credito totale piattaforma
    platform_stats = await db.platform_stats.find_one({"id": "main"})
    credito_piattaforma = platform_stats.get("credito_totale", 0) if platform_stats else 0
    ordini_completati_platform = platform_stats.get("ordini_completati", 0) if platform_stats else 0
    
    return {
        "users": {
            "total": total_users
        },
        "bookstores": {
            "total": total_bookstores,
            "pending_requests": pending_requests
        },
        "orders": {
            "total": total_orders,
            "completed": orders_completed,
            "pending": orders_pending,
            "completed_today": len(orders_today),
            "completed_month": len(orders_month)
        },
        "listings": {
            "total": total_listings,
            "active": active_listings
        },
        "reports": {
            "pending": pending_reports
        },
        "guadagni_piattaforma": {
            "oggi": round(guadagno_oggi, 2),
            "mese": round(guadagno_mese, 2),
            "formula": "10% libro / 2 - proporzione Stripe"
        },
        "credito_piattaforma": {
            "totale": round(credito_piattaforma, 2),
            "ordini_processati": ordini_completati_platform
        },
        "foderazione": {
            "oggi": foderazione_oggi,
            "mese": foderazione_mese
        }
    }

@api_router.get("/admin/users")
async def get_all_users(admin_id: str = Query(...), skip: int = 0, limit: int = 50):
    """Admin: lista utenti"""
    admin = await db.users.find_one({"id": admin_id})
    if not admin or not admin.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    users = await db.users.find().skip(skip).limit(limit).to_list(limit)
    
    for user in users:
        user.pop('_id', None)
        user.pop('password', None)  # Non esporre password
    
    total = await db.users.count_documents({})
    
    return {"users": users, "total": total}

@api_router.get("/admin/orders")
async def get_all_orders(admin_id: str = Query(...), skip: int = 0, limit: int = 50):
    """Admin: lista ordini"""
    admin = await db.users.find_one({"id": admin_id})
    if not admin or not admin.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    orders = await db.orders.find().sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    for order in orders:
        order.pop('_id', None)
    
    total = await db.orders.count_documents({})
    
    return {"orders": orders, "total": total}

@api_router.get("/admin/bookstores")
async def get_all_bookstores(admin_id: str = Query(...)):
    """Admin: lista cartolibrerie"""
    admin = await db.users.find_one({"id": admin_id})
    if not admin or not admin.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Accesso non autorizzato")
    
    bookstores = await db.bookstores.find().to_list(100)
    
    for bs in bookstores:
        bs.pop('_id', None)
    
    return {"bookstores": bookstores}

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


@api_router.get("/bookstore/{bookstore_id}/dashboard")
async def get_bookstore_dashboard(bookstore_id: str):
    """Cartolibreria: dashboard completa con ordini, notifiche e statistiche"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # ============= AUTO-COMPLETA ORDINI SCADUTI =============
    # Processa automaticamente gli ordini il cui periodo di reso è scaduto
    now = datetime.utcnow()
    orders_to_complete = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": "picked_up"
    }).to_list(100)
    
    for order in orders_to_complete:
        return_deadline = order.get("return_deadline")
        if return_deadline:
            if isinstance(return_deadline, str):
                try:
                    return_deadline = datetime.fromisoformat(return_deadline.replace('Z', '+00:00').replace('+00:00', ''))
                except:
                    continue
            
            if now > return_deadline:
                # Completa l'ordine automaticamente
                order_id = order.get("id")
                update_data = {
                    "status": "completed",
                    "completed_at": now,
                    "auto_completed": True,
                    "status_history": order.get("status_history", []) + [{
                        "status": "completed",
                        "timestamp": now.isoformat(),
                        "note": "Ordine completato automaticamente - Periodo reso scaduto"
                    }]
                }
                await db.orders.update_one({"id": order_id}, {"$set": update_data})
                
                # Accredita cartolibreria
                commissione_libro = order.get("commissione_cartolibreria_libro", 0)
                commissione_foderazione = order.get("commissione_cartolibreria_foderazione", 0)
                commissione_totale = order.get("commissione_cartolibreria", 0)
                
                await db.bookstores.update_one(
                    {"id": bookstore_id},
                    {"$inc": {
                        "credito_commissioni": commissione_libro,
                        "credito_foderazione": commissione_foderazione,
                        "credito_totale": commissione_totale
                    }}
                )
                
                # Accredita piattaforma
                commissione_piattaforma = order.get("commissione_piattaforma", 0)
                if commissione_piattaforma > 0:
                    await db.platform_stats.update_one(
                        {"id": "main"},
                        {"$inc": {"credito_totale": commissione_piattaforma, "ordini_completati": 1}},
                        upsert=True
                    )
                
                # Notifica venditore
                netto_venditore = order.get("netto_venditore", 0)
                notification_seller = {
                    "id": str(uuid.uuid4()),
                    "user_id": order.get("seller_id"),
                    "type": "payment_released",
                    "title": "Pagamento sbloccato!",
                    "message": f"Il periodo di reso per:\n📚 {order.get('book_titolo')}\n\nè terminato.\n\n💰 €{netto_venditore:.2f} saranno trasferiti sul tuo conto entro 3-5 giorni lavorativi.",
                    "order_id": order_id,
                    "order_code": order.get("order_code"),
                    "amount": netto_venditore,
                    "read": False,
                    "created_at": now.isoformat()
                }
                await db.notifications.insert_one(notification_seller)
                print(f"✅ Auto-completato ordine {order.get('order_code')} dalla dashboard")
    
    # Ricarica bookstore dopo eventuali aggiornamenti
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    
    # Date per statistiche
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    # Ordini per stato
    all_orders = await db.orders.find({"bookstore_id": bookstore_id}).to_list(1000)
    
    orders_in_arrivo = []
    orders_da_ritirare = []
    orders_completati = []
    orders_resi = []
    
    for order in all_orders:
        order.pop('_id', None)
        status = order.get("status", "")
        
        if status in ["paid_escrow", "pagato_attesa_consegna", "delivering_to_bookstore", "in_attesa_consegna"]:
            orders_in_arrivo.append(order)
        elif status in ["ready_for_pickup", "pronto_per_ritiro", "delivered_to_bookstore"]:
            orders_da_ritirare.append(order)
        elif status in ["completed", "picked_up"]:
            orders_completati.append(order)
        elif status in ["return_requested", "returned", "refunded", "reso_richiesto", "in_verifica_reso"]:
            orders_resi.append(order)
    
    # Ordini completati oggi e questo mese
    def normalize_date(val):
        if isinstance(val, datetime):
            return val.isoformat()
        return val if val else ""
    
    completati_oggi = [o for o in orders_completati 
        if o.get("completed_at") and normalize_date(o.get("completed_at")) >= today_start.isoformat()]
    completati_mese = [o for o in orders_completati 
        if o.get("completed_at") and normalize_date(o.get("completed_at")) >= month_start.isoformat()]
    
    # Calcolo guadagni cartolibreria con nuova formula
    guadagno_libri_oggi = 0
    guadagno_libri_mese = 0
    guadagno_foderazione_oggi = 0
    guadagno_foderazione_mese = 0
    num_foderazione_oggi = 0
    num_foderazione_mese = 0
    
    for order in completati_oggi:
        prezzo = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        comm = calcola_commissioni(prezzo, include_fod)
        guadagno_libri_oggi += comm["commissione_cartolibreria_libro"]
        guadagno_foderazione_oggi += comm["commissione_cartolibreria_foderazione"]
        if include_fod:
            num_foderazione_oggi += 1
    
    for order in completati_mese:
        prezzo = order.get("prezzo_libro", 0)
        include_fod = order.get("include_foderazione", False)
        comm = calcola_commissioni(prezzo, include_fod)
        guadagno_libri_mese += comm["commissione_cartolibreria_libro"]
        guadagno_foderazione_mese += comm["commissione_cartolibreria_foderazione"]
        if include_fod:
            num_foderazione_mese += 1
    
    # Ordini scaduti (deadline passata)
    ordini_scaduti = 0
    for order in orders_in_arrivo:
        deadline = order.get("seller_delivery_deadline")
        if deadline and deadline < now.isoformat():
            ordini_scaduti += 1
    
    # Notifiche non lette
    notifications = await db.bookstore_notifications.find({
        "bookstore_id": bookstore_id
    }).sort("created_at", -1).to_list(50)
    
    for n in notifications:
        n.pop('_id', None)
    
    return {
        "bookstore_name": bookstore.get("nome", "Cartolibreria"),
        "bookstore_id": bookstore_id,
        "stats": {
            "in_arrivo": len(orders_in_arrivo),
            "da_ritirare": len(orders_da_ritirare),
            "completati_oggi": len(completati_oggi),
            "completati_mese": len(completati_mese),
            "resi_in_attesa": len([o for o in orders_resi if o.get("status") in ["return_requested", "reso_richiesto"]]),
            "ordini_scaduti": ordini_scaduti,
            "guadagno_oggi": round(guadagno_libri_oggi + guadagno_foderazione_oggi, 2),
            "guadagno_mese": round(guadagno_libri_mese + guadagno_foderazione_mese, 2),
            "guadagno_libri_oggi": round(guadagno_libri_oggi, 2),
            "guadagno_libri_mese": round(guadagno_libri_mese, 2),
            "guadagno_foderazione_oggi": round(guadagno_foderazione_oggi, 2),
            "guadagno_foderazione_mese": round(guadagno_foderazione_mese, 2),
            "num_foderazione_oggi": num_foderazione_oggi,
            "num_foderazione_mese": num_foderazione_mese,
        },
        "orders_in_arrivo": orders_in_arrivo,
        "orders_da_ritirare": orders_da_ritirare,
        "orders_completati": orders_completati[-20:],  # Ultimi 20
        "orders_resi": orders_resi,
        "notifications": notifications,
        "formula": {
            "libri": "10% / 2 - proporzione Stripe",
            "foderazione": "€1,50 - proporzione Stripe"
        }
    }


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
async def bookstore_confirm_seller_delivery(
    bookstore_id: str, 
    order_code: str = Query(...),
    idoneo: bool = Query(True, description="True = IDONEO, False = NON IDONEO"),
    notes: str = Query("", description="Note sulla verifica")
):
    """
    Cartolibreria: verifica libro consegnato dal venditore.
    - IDONEO: Libro conforme alla descrizione → Pronto per ritiro
    - NON IDONEO: Libro non conforme → Rimborso acquirente
    """
    
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
    
    # Deve essere in stato pagato_attesa_consegna o paid_escrow
    current_status = order.get("status")
    if current_status not in ["paid_escrow", "pagato_attesa_consegna"]:
        if current_status == "pronto_per_ritiro" or current_status == "ready_for_pickup":
            raise HTTPException(status_code=400, detail="Il libro è già stato consegnato. In attesa del ritiro dell'acquirente.")
        if current_status == "completed":
            raise HTTPException(status_code=400, detail="Ordine già completato.")
        raise HTTPException(status_code=400, detail=f"Stato ordine non valido per la consegna: {current_status}")
    
    now = datetime.utcnow()
    
    if idoneo:
        # ✅ IDONEO - Libro conforme
        update_data = {
            "status": "pronto_per_ritiro",
            "delivered_to_bookstore_at": now,
            "bookstore_verified_at": now,
            "bookstore_verification_notes": notes or "Libro conforme alla descrizione",
            "ready_for_pickup_at": now,
            "status_history": order.get("status_history", []) + [{
                "status": "pronto_per_ritiro",
                "timestamp": now.isoformat(),
                "note": f"✅ IDONEO - Libro verificato e pronto per ritiro presso {bookstore['nome']}"
            }]
        }
        
        await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
        
        # Notifica al VENDITORE
        notification_seller = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "book_verified_ok",
            "title": "Libro verificato!",
            "message": f"Il testo:\n📚 {order.get('book_titolo')}\n\nè risultato idoneo.\nAl ritiro effettuato dall'acquirente verranno sbloccati i fondi.\nGrazie.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_seller)
        
        # Notifica all'ACQUIRENTE che può ritirare
        notification_buyer = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("buyer_id"),
            "type": "ready_for_pickup",
            "title": "Il tuo libro è pronto!",
            "message": f"Il testo:\n📚 {order.get('book_titolo')}\n\nè disponibile presso:\n🏪 {bookstore['nome']}\n\nMostra il seguente codice per il ritiro:\n🔐 {order.get('order_code')}\n\ninsieme al QR associato all'ordine.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "bookstore_name": bookstore['nome'],
            "data": {
                "order_id": order["id"],
                "order_code": order.get("order_code"),
                "bookstore_name": bookstore['nome'],
                "show_qr": True
            },
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_buyer)
        
        return {
            "success": True,
            "status": "pronto_per_ritiro",
            "message": f"✅ Libro IDONEO! L'acquirente {order.get('buyer_name')} è stato notificato.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "buyer_name": order.get("buyer_name"),
            "next_step": "In attesa del ritiro dell'acquirente"
        }
    else:
        # ❌ NON IDONEO - Libro non conforme → Rimborso
        update_data = {
            "status": "rifiutato_condizioni",
            "payment_status": "refunded",
            "delivered_to_bookstore_at": now,
            "bookstore_verified_at": now,
            "bookstore_verification_notes": notes or "Condizioni libro non conformi alla descrizione",
            "status_history": order.get("status_history", []) + [{
                "status": "rifiutato_condizioni",
                "timestamp": now.isoformat(),
                "note": f"❌ NON IDONEO - Le condizioni del libro non corrispondono alla descrizione. {notes}"
            }]
        }
        
        await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
        
        # Rimetti il listing come disponibile (torna al venditore)
        await db.listings.update_one(
            {"id": order.get("listing_id")},
            {"$set": {"status": "available", "stato": "disponibile"}, "$unset": {"reserved_by": "", "order_id": ""}}
        )
        
        # Notifica al VENDITORE
        notification_seller = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("seller_id"),
            "type": "book_rejected_conditions",
            "title": "Libro rifiutato",
            "message": f"Il libro:\n📚 {order.get('book_titolo')}\n\nè stato rifiutato.\nLe condizioni del testo non corrispondono alla descrizione inserita nell'annuncio.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_seller)
        
        # Notifica all'ACQUIRENTE
        notification_buyer = {
            "id": str(uuid.uuid4()),
            "user_id": order.get("buyer_id"),
            "type": "order_refunded_conditions",
            "title": "Ordine rimborsato",
            "message": f"Il libro:\n📚 {order.get('book_titolo')}\n\nè stato rifiutato per incongruenze nelle condizioni dichiarate.\nI fondi verranno riaccreditati automaticamente.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "read": False,
            "created_at": now.isoformat()
        }
        await db.notifications.insert_one(notification_buyer)
        
        return {
            "success": True,
            "status": "rifiutato_condizioni",
            "message": f"❌ Libro NON IDONEO. L'acquirente riceverà il rimborso. Il libro torna disponibile al venditore.",
            "order_id": order["id"],
            "order_code": order.get("order_code"),
            "book_titolo": order.get("book_titolo"),
            "refunded": True
        }

@api_router.post("/bookstore/{bookstore_id}/confirm-pickup-by-code")
async def bookstore_confirm_pickup_by_code(bookstore_id: str, order_code: str = Query(...)):
    """
    Cartolibreria: conferma ritiro acquirente (stesso QR usato per consegna).
    Inizia periodo di 3 giorni per eventuale reso.
    """
    
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
    
    current_status = order.get("status")
    if current_status not in ["ready_for_pickup", "pronto_per_ritiro"]:
        status_label = ORDER_STATES.get(current_status, current_status)
        raise HTTPException(
            status_code=400, 
            detail=f"Ordine non pronto per il ritiro. Stato attuale: {status_label}"
        )
    
    now = datetime.utcnow()
    from datetime import timedelta
    return_deadline = now + timedelta(hours=RETURN_WINDOW_HOURS)  # 72h = 3 giorni
    
    # Aggiorna ordine a "picked_up" - inizia periodo reso
    update_data = {
        "status": "picked_up",
        "picked_up_at": now,
        "return_deadline": return_deadline,
        "confirmed_by_bookstore": True,
        "status_history": order.get("status_history", []) + [{
            "status": "picked_up",
            "timestamp": now.isoformat(),
            "note": f"Ritiro confermato dalla cartolibreria {bookstore['nome']} - Inizia periodo reso 3 giorni"
        }]
    }
    
    await db.orders.update_one({"id": order["id"]}, {"$set": update_data})
    
    # Aggiorna listing come venduto
    await db.listings.update_one(
        {"id": order.get("listing_id")},
        {"$set": {"status": "sold", "stato": "venduto", "sold_at": now, "sold_to": order.get("buyer_id")}}
    )
    
    # Notifica al venditore (pagamento dopo 3 giorni)
    notification_seller = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "book_picked_up",
        "title": "Libro ritirato!",
        "message": f"L'acquirente ha ritirato:\n📚 {order.get('book_titolo')}\n\nRiceverai il pagamento di €{order.get('netto_venditore', 0):.2f} tra 3/5 giorni lavorativi se non verranno trovate evidenti differenze nelle descrizioni dall'acquirente.",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_seller)
    
    # Notifica all'acquirente
    notification_buyer = {
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "pickup_confirmed",
        "title": "Libro ritirato!",
        "message": f"Hai ritirato:\n📚 {order.get('book_titolo')}\n\nHai 3 giorni per richiedere il reso, in \"I miei scambi\" nella sezione Profilo, solo ed esclusivamente se la descrizione delle condizioni inserita non corrisponde a quelle reali del libro, già sottoposto al controllo nei punti di ritiro durante la consegna.",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "return_deadline": return_deadline.isoformat(),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.notifications.insert_one(notification_buyer)
    
    # Notifica alla cartolibreria
    bookstore_notification = {
        "id": str(uuid.uuid4()),
        "bookstore_id": bookstore_id,
        "type": "order_pickup_completed",
        "title": "Ritiro completato",
        "message": f"Ordine {order.get('order_code')} - Ritiro completato!\n\nLibro: {order.get('book_titolo')}\nAcquirente: {order.get('buyer_name')}\n\nIl pagamento sarà sbloccato tra 3/5 giorni lavorativi se non verranno trovate evidenti differenze nelle descrizioni dall'acquirente.",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "commissione_cartolibreria": order.get("commissione_cartolibreria", 0),
        "read": False,
        "created_at": now.isoformat()
    }
    await db.bookstore_notifications.insert_one(bookstore_notification)
    
    return {
        "success": True,
        "status": "picked_up",
        "order_id": order["id"],
        "order_code": order.get("order_code"),
        "book_titolo": order.get("book_titolo"),
        "buyer_name": order.get("buyer_name"),
        "return_deadline": return_deadline.isoformat(),
        "message": "Ritiro confermato! L'acquirente ha 3 giorni per verificare le condizioni."
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
            "book_isbn": order.get("book_isbn", order.get("isbn", "")),
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
    # Social media handles/keywords
    r'(?i)(instagram|facebook|whatsapp|telegram|messenger|twitter|tiktok|snapchat)',
    r'(?i)(ig:|fb:|wa\.me|t\.me)',
    # Common contact phrases
    r'(?i)(chiamami|contattami|scrivimi su|il mio numero|la mia mail|mio contatto)',
    r'(?i)(ci vediamo|incontriamoci|dove abiti|il tuo numero|la tua mail)',
    # Indirizzi (via, piazza, viale, etc.)
    r'(?i)\b(via|viale|v\.le|piazza|p\.zza|p\.za|piazzale|trav|traversa|corso|c\.so|largo|vicolo)\s+[a-zA-Z]',
]

def contains_blocked_content(message: str, user_nome: str = None, user_cognome: str = None) -> tuple[bool, str]:
    """Check if message contains blocked content. Returns (is_blocked, reason)"""
    
    message_lower = message.lower()
    
    # Check against regex patterns
    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, message):
            return True, "Il messaggio contiene informazioni di contatto non permesse"
    
    # Blocca @ (chiocciola) - sia il simbolo che la parola
    if '@' in message or 'chiocciola' in message_lower:
        return True, "Non è possibile condividere indirizzi email"
    
    # Blocca numeri di telefono: più di 3 cifre consecutive, ESCLUDE codici ISBN (iniziano con 978)
    # Trova tutte le sequenze di numeri (anche con spazi/trattini)
    # Rimuovi spazi e trattini per contare le cifre
    cleaned_for_numbers = re.sub(r'[^\d]', '', message)
    
    # Trova gruppi di numeri nel messaggio originale
    number_groups = re.findall(r'[\d\s\-\.]{4,}', message)
    for num_group in number_groups:
        digits_only = re.sub(r'[^\d]', '', num_group)
        # Se ha più di 3 cifre e NON inizia con 978 (ISBN), blocca
        if len(digits_only) > 3 and not digits_only.startswith('978'):
            return True, "Non è possibile condividere numeri di telefono"
    
    # Blocca anche numeri scritti in lettere se sono tanti insieme
    numeri_parole = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci']
    count_numeri_parole = sum(1 for n in numeri_parole if n in message_lower)
    if count_numeri_parole > 3:
        return True, "Non è possibile condividere numeri di telefono"
    
    # Check if message contains user's real name (con variazioni)
    if user_nome:
        nome_lower = user_nome.lower().strip()
        if len(nome_lower) >= 3:
            # Nome esatto
            if nome_lower in message_lower:
                return True, "Non puoi condividere il tuo nome reale"
            
            # Nome senza vocale finale (Valerio -> Valeri)
            if nome_lower[-1] in 'aeiou' and len(nome_lower) > 3:
                nome_troncato = nome_lower[:-1]
                # Cerca il nome troncato come parola (con possibili consonanti dopo)
                pattern_nome = rf'\b{re.escape(nome_troncato)}[bcdfghjklmnpqrstvwxyz]*\b'
                if re.search(pattern_nome, message_lower):
                    return True, "Non puoi condividere il tuo nome reale"
            
            # Nome con consonanti aggiunte (Valerio -> Valerios)
            pattern_nome_extra = rf'\b{re.escape(nome_lower)}[bcdfghjklmnpqrstvwxyz]+\b'
            if re.search(pattern_nome_extra, message_lower):
                return True, "Non puoi condividere il tuo nome reale"
    
    if user_cognome:
        cognome_lower = user_cognome.lower().strip()
        if len(cognome_lower) >= 3:
            # Cognome esatto
            if cognome_lower in message_lower:
                return True, "Non puoi condividere il tuo cognome reale"
            
            # Cognome senza vocale finale
            if cognome_lower[-1] in 'aeiou' and len(cognome_lower) > 3:
                cognome_troncato = cognome_lower[:-1]
                pattern_cognome = rf'\b{re.escape(cognome_troncato)}[bcdfghjklmnpqrstvwxyz]*\b'
                if re.search(pattern_cognome, message_lower):
                    return True, "Non puoi condividere il tuo cognome reale"
            
            # Cognome con consonanti aggiunte
            pattern_cognome_extra = rf'\b{re.escape(cognome_lower)}[bcdfghjklmnpqrstvwxyz]+\b'
            if re.search(pattern_cognome_extra, message_lower):
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


# ============== CHAT / MESSAGING SYSTEM ==============

class ConversationCreate(BaseModel):
    """Create a new conversation"""
    buyer_id: str
    seller_id: str
    listing_id: str
    book_isbn: str
    book_title: str

class MessageCreate(BaseModel):
    """Create a new message"""
    sender_id: str
    content: str

class Conversation(BaseModel):
    """Conversation model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    listing_id: str
    book_isbn: str
    book_title: str
    buyer_id: str
    buyer_username: str
    seller_id: str
    seller_username: str
    last_message: Optional[str] = None
    last_message_at: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class ConversationMessage(BaseModel):
    """Chat message model"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    conversation_id: str
    sender_id: str
    sender_username: str
    content: str
    read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


@api_router.post("/conversations")
async def create_or_get_conversation(data: ConversationCreate):
    """
    Create a new conversation or return existing one.
    A conversation is unique per buyer-seller-listing combination.
    """
    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "buyer_id": data.buyer_id,
        "seller_id": data.seller_id,
        "listing_id": data.listing_id
    })
    
    if existing:
        existing.pop("_id", None)
        return existing
    
    # Get buyer info (must be a real user)
    buyer = await db.users.find_one({"id": data.buyer_id})
    if not buyer:
        raise HTTPException(status_code=404, detail="Acquirente non trovato")
    
    # Generate anonymous code for buyer
    buyer_code = buyer.get("username")
    if not buyer_code or buyer_code == "Utente":
        code_part = data.buyer_id.split("-")[-1][:5].upper()
        buyer_code = f"Utente_{code_part}"
    
    # Get seller info - generate anonymous code
    seller = await db.users.find_one({"id": data.seller_id})
    
    if seller:
        seller_code = seller.get("username")
        if not seller_code or seller_code == "Utente":
            code_part = data.seller_id.split("-")[-1][:5].upper()
            seller_code = f"Utente_{code_part}"
    else:
        # Seller might be test data - generate anonymous code from seller_id
        listing = await db.listings.find_one({"id": data.listing_id})
        if listing:
            code_part = data.seller_id.split("-")[-1][:5].upper()
            seller_code = f"Utente_{code_part}"
        else:
            raise HTTPException(status_code=404, detail="Venditore non trovato")
    
    # Prevent chatting with yourself
    if data.buyer_id == data.seller_id:
        raise HTTPException(status_code=400, detail="Non puoi contattare te stesso")
    
    conversation = Conversation(
        listing_id=data.listing_id,
        book_isbn=data.book_isbn,
        book_title=data.book_title,
        buyer_id=data.buyer_id,
        buyer_username=buyer_code,
        seller_id=data.seller_id,
        seller_username=seller_code,
    )
    
    await db.conversations.insert_one(conversation.dict())
    
    return conversation.dict()


@api_router.get("/conversations/{user_id}")
async def get_user_conversations(user_id: str):
    """Get all conversations for a user (as buyer or seller)"""
    conversations = await db.conversations.find({
        "$or": [
            {"buyer_id": user_id},
            {"seller_id": user_id}
        ]
    }).sort("last_message_at", -1).to_list(100)
    
    # Count unread messages for each conversation
    result = []
    for conv in conversations:
        conv.pop("_id", None)
        
        # Count unread messages where sender is not the current user
        unread_count = await db.messages.count_documents({
            "conversation_id": conv["id"],
            "sender_id": {"$ne": user_id},
            "read": False
        })
        conv["unread_count"] = unread_count
        result.append(conv)
    
    return {"conversations": result}


@api_router.get("/conversations/detail/{conversation_id}")
async def get_conversation_detail(conversation_id: str):
    """Get conversation details"""
    conversation = await db.conversations.find_one({"id": conversation_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    conversation.pop("_id", None)
    
    # Se manca il book_title, cercalo dal listing
    if not conversation.get("book_title") and conversation.get("listing_id"):
        listing = await db.listings.find_one({"id": conversation["listing_id"]})
        if listing:
            book_title = listing.get("book_titolo") or listing.get("book_title") or "Libro"
            conversation["book_title"] = book_title
            # Aggiorna anche nel DB per le prossime volte
            await db.conversations.update_one(
                {"id": conversation_id},
                {"$set": {"book_title": book_title}}
            )
    
    return conversation


@api_router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(conversation_id: str):
    """Get all messages in a conversation"""
    messages = await db.messages.find({
        "conversation_id": conversation_id
    }).sort("created_at", 1).to_list(500)
    
    for msg in messages:
        msg.pop("_id", None)
    
    return {"messages": messages}


# ============== FILTRO MESSAGGI CHAT ==============

# Lista di nomi propri italiani comuni da bloccare
NOMI_ITALIANI = [
    # Nomi maschili comuni
    'marco', 'luca', 'andrea', 'matteo', 'lorenzo', 'alessandro', 'francesco', 'leonardo',
    'riccardo', 'gabriele', 'tommaso', 'edoardo', 'federico', 'giuseppe', 'antonio',
    'giovanni', 'pietro', 'davide', 'simone', 'filippo', 'michele', 'nicola', 'stefano',
    'roberto', 'alberto', 'giorgio', 'paolo', 'fabio', 'daniele', 'massimo', 'emanuele',
    'vincenzo', 'salvatore', 'domenico', 'raffaele', 'carlo', 'mario', 'luigi', 'franco',
    'giulio', 'enrico', 'sergio', 'claudio', 'maurizio', 'luciano', 'bruno', 'gianluca',
    'christian', 'manuel', 'valerio', 'nicholas', 'alex', 'kevin', 'thomas', 'samuel',
    'diego', 'jacopo', 'samuele', 'dennis', 'cristian', 'mirko', 'ivan',
    # Nomi maschili aggiuntivi
    'orazio', 'rocco', 'carmelo', 'calogero', 'pasquale', 'gennaro', 'ciro', 'aniello',
    'agostino', 'alfredo', 'amedeo', 'angelo', 'arturo', 'aurelio', 'benito', 'beniamino',
    'bernardo', 'camillo', 'carmine', 'cesare', 'corrado', 'cosimo', 'costantino', 'dario',
    'dino', 'donato', 'egidio', 'elia', 'enzo', 'ernesto', 'ettore', 'eugenio', 'ezio',
    'fabrizio', 'felice', 'ferdinando', 'filiberto', 'flavio', 'fulvio', 'gaetano',
    'gerardo', 'germano', 'giacomo', 'gianfranco', 'gianmarco', 'gianpaolo', 'gilberto',
    'gino', 'giordano', 'guglielmo', 'guido', 'gustavo', 'ignazio', 'isidoro', 'italo',
    'lamberto', 'lauro', 'leandro', 'leone', 'livio', 'loris', 'lucio', 'luigi', 'marcello',
    'marino', 'martino', 'massimiliano', 'mauro', 'nando', 'narciso', 'natale', 'natalino',
    'nazario', 'nello', 'nereo', 'nevio', 'nunzio', 'oliviero', 'omar', 'onofrio', 'oreste',
    'orlando', 'oscar', 'osvaldo', 'otello', 'ottavio', 'ottorino', 'pancrazio', 'patrizio',
    'pellegrino', 'pier', 'piero', 'primo', 'prospero', 'quirino', 'raimondo', 'remo',
    'renato', 'renzo', 'rinaldo', 'rodolfo', 'rolando', 'romeo', 'rosario', 'ruggero',
    'sabatino', 'sandro', 'santino', 'santo', 'saverio', 'sebastiano', 'secondo', 'serafino',
    'severino', 'silvano', 'silvio', 'siro', 'tancredi', 'tarcisio', 'teodoro', 'tiberio',
    'tiziano', 'tobia', 'tullio', 'ubaldo', 'ugo', 'umberto', 'urbano', 'valentino', 'vasco',
    'vittorio', 'walter', 'zeno',
    # Nomi femminili comuni
    'giulia', 'sofia', 'aurora', 'alice', 'ginevra', 'emma', 'giorgia', 'martina',
    'sara', 'chiara', 'anna', 'gaia', 'elena', 'francesca', 'valentina', 'alessia',
    'beatrice', 'elisa', 'rebecca', 'camilla', 'vittoria', 'noemi', 'nicole', 'matilde',
    'arianna', 'bianca', 'carlotta', 'claudia', 'cristina', 'daniela', 'eleonora',
    'federica', 'ilaria', 'jessica', 'laura', 'lucia', 'marta', 'michela', 'monica',
    'paola', 'roberta', 'silvia', 'simona', 'serena', 'stefania', 'teresa', 'valeria',
    'vanessa', 'veronica', 'virginia', 'maria', 'rosa', 'angela', 'giovanna', 'patrizia',
    'barbara', 'sabrina', 'manuela', 'emanuela', 'antonella', 'raffaella', 'rossella',
    # Nomi femminili aggiuntivi
    'ada', 'adele', 'adriana', 'agata', 'agnese', 'alberta', 'alessandra', 'amalia',
    'ambra', 'amelia', 'anastasia', 'angelica', 'anita', 'annalisa', 'annamaria',
    'antonia', 'antonietta', 'assunta', 'azzurra', 'benedetta', 'berenice', 'bruna',
    'brunella', 'carla', 'carmela', 'carolina', 'caterina', 'cecilia', 'cinzia', 'clara',
    'clarissa', 'clelia', 'clotilde', 'concetta', 'cornelia', 'cosima', 'debora', 'diana',
    'dina', 'dolores', 'domenica', 'donatella', 'dora', 'edvige', 'elvira', 'enrica',
    'erminia', 'ester', 'eugenia', 'eva', 'fabiana', 'fabiola', 'fiorella', 'flora',
    'franca', 'fulvia', 'gabriella', 'gelsomina', 'gertrude', 'giacinta', 'gilda',
    'gina', 'giorgina', 'giuseppa', 'giuseppina', 'grazia', 'graziella', 'ida', 'immacolata',
    'ines', 'irene', 'irma', 'isabella', 'ivana', 'lea', 'leda', 'letizia', 'lidia',
    'liliana', 'lina', 'linda', 'lisa', 'livia', 'lorena', 'lorenza', 'loredana', 'luana',
    'luciana', 'luisa', 'maddalena', 'mafalda', 'marcella', 'margherita', 'mariangela',
    'marianna', 'marilena', 'marina', 'marisa', 'maristella', 'marzia', 'maura', 'melania',
    'milena', 'mirella', 'miriam', 'nadia', 'natalia', 'nicoletta', 'nilde', 'nunzia',
    'olga', 'ornella', 'orsola', 'palmira', 'pamela', 'pietrina', 'pina', 'rachele',
    'renata', 'rita', 'romina', 'rosalia', 'rosanna', 'rosaria', 'rosamaria', 'rosina',
    'rossana', 'ruth', 'samanta', 'samantha', 'sandra', 'santina', 'silvana', 'sonia',
    'stella', 'susanna', 'tania', 'tatiana', 'tina', 'tiziana', 'vera', 'wanda', 'wilma',
    # Nomi stranieri comuni in Italia
    'mohamed', 'ahmed', 'ali', 'omar', 'adam', 'david', 'daniel', 'gabriel', 'michael',
    'jason', 'brian', 'ryan', 'dylan', 'jordan', 'justin', 'brandon', 'tyler', 'william',
    'james', 'john', 'robert', 'richard', 'joseph', 'charles', 'steven', 'anthony',
    'fatima', 'aisha', 'amira', 'layla', 'yasmine', 'nadia', 'sarah', 'jennifer', 'emily',
    'jessica', 'ashley', 'amanda', 'stephanie', 'michelle', 'kimberly', 'melissa', 'linda',
    # Diminutivi e varianti comuni
    'ale', 'fra', 'fede', 'ste', 'matte', 'andre', 'giuly', 'vale', 'lore', 'nico',
    'miki', 'roby', 'tommy', 'dani', 'simo', 'max', 'gigi', 'toni', 'peppe', 'nino',
    'ciro', 'mimmo', 'totò', 'ciccio', 'beppe', 'gino', 'pippo', 'rino', 'nanni',
    'titti', 'lella', 'lilli', 'nene', 'ceci', 'gigia', 'peppa', 'titty', 'sissy',
]

def check_message_content(content: str, sender_name: str = "", other_user_name: str = "") -> tuple[bool, str]:
    """
    Verifica se un messaggio contiene informazioni di contatto proibite.
    Restituisce (is_valid, error_message)
    """
    import re
    
    content_lower = content.lower()
    error_msg = "Solo informazioni relative al libro"
    
    # 0. Blocca nomi propri italiani (anche con variazioni)
    for nome in NOMI_ITALIANI:
        # Cerca il nome come parola intera (non parte di altre parole)
        if re.search(rf'\b{nome}\b', content_lower):
            return False, error_msg
        
        # Nome senza vocale finale (Valerio -> Valeri)
        if nome[-1] in 'aeiou' and len(nome) > 3:
            nome_troncato = nome[:-1]
            # Nome troncato + eventualmente consonanti dopo (Valeri, Valeris, Valerix)
            if re.search(rf'\b{nome_troncato}[bcdfghjklmnpqrstvwxyz]*\b', content_lower):
                return False, error_msg
        
        # Nome con consonanti aggiunte (Valerio -> Valerios, Valeriox)
        if re.search(rf'\b{nome}[bcdfghjklmnpqrstvwxyz]+\b', content_lower):
            return False, error_msg
    
    # 0b. Blocca anche il nome del mittente se fornito (con variazioni)
    if sender_name and len(sender_name) >= 3:
        sender_lower = sender_name.lower().strip()
        if sender_lower in content_lower:
            return False, error_msg
        # Variazione senza vocale finale
        if sender_lower[-1] in 'aeiou' and len(sender_lower) > 3:
            sender_troncato = sender_lower[:-1]
            if re.search(rf'\b{re.escape(sender_troncato)}[bcdfghjklmnpqrstvwxyz]*\b', content_lower):
                return False, error_msg
        # Variazione con consonanti aggiunte
        if re.search(rf'\b{re.escape(sender_lower)}[bcdfghjklmnpqrstvwxyz]+\b', content_lower):
            return False, error_msg
    
    # 1. Blocca @ (sia simbolo che parola "chiocciola")
    if '@' in content:
        return False, error_msg
    
    # 2. Blocca QUALSIASI sequenza di 4+ cifre TRANNE codici ISBN (iniziano con 978)
    content_no_spaces = re.sub(r'[\s\-\.\(\)/,]', '', content)
    # Trova tutti i gruppi di numeri
    number_matches = re.findall(r'\d{4,}', content_no_spaces)
    for num in number_matches:
        # Permetti SOLO codici ISBN (iniziano con 978 o 979)
        if not (num.startswith('978') or num.startswith('979')):
            return False, error_msg
    
    # 3. Blocca numeri scritti con spazi tra le cifre (es: "3 3 3 1 2 3")
    # Ma permetti se è un ISBN
    digits_and_spaces = re.sub(r'[^\d\s]', '', content)
    digits_only = re.sub(r'\s', '', digits_and_spaces)
    if len(digits_only) >= 4:
        # Controlla se potrebbe essere un ISBN
        if not (digits_only.startswith('978') or digits_only.startswith('979')):
            return False, error_msg
    
    # 4. Blocca numeri scritti in lettere - ANCHE SINGOLI
    number_words = [
        r'\bzero\b', r'\buno\b', r'\bdue\b', r'\btre\b', r'\bquattro\b',
        r'\bcinque\b', r'\bsei\b', r'\bsette\b', r'\botto\b', r'\bnove\b',
        r'\bdieci\b', r'\bundici\b', r'\bdodici\b', r'\btredici\b', r'\bquattordici\b',
        r'\bquindici\b', r'\bsedici\b', r'\bdiciassette\b', r'\bdiciotto\b', r'\bdiciannove\b',
        r'\bventi\b', r'\btrenta\b', r'\bquaranta\b', r'\bcinquanta\b',
        r'\bsessanta\b', r'\bsettanta\b', r'\bottanta\b', r'\bnovanta\b', r'\bcento\b',
    ]
    for pattern in number_words:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 4b. Blocca parole indirizzi SINGOLE (via, piazza, viale, ecc.) - case insensitive
    address_single_words = [
        r'\bvia\b', r'\bviale\b', r'\bv\.le\b', r'\bv\.\b',
        r'\bpiazza\b', r'\bp\.zza\b', r'\bp\.za\b', r'\bpiazzale\b', r'\bp\.le\b',
        r'\bcorso\b', r'\bc\.so\b',
        r'\blargo\b', r'\bl\.go\b',
        r'\bvicolo\b', r'\bvic\.\b',
        r'\btraversa\b', r'\btrav\b', r'\btrav\.\b',
        r'\bcontrada\b', r'\bc\.da\b',
        r'\bstrada\b', r'\bstr\.\b',
        r'\blocalità\b', r'\bloc\.\b', r'\bloc\b',
    ]
    for pattern in address_single_words:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 5. Blocca pattern di presentazione nome - SEMPRE BLOCCATI
    name_patterns = [
        r'mi\s*chiamo',           # "mi chiamo"
        r'mi\s*famo',             # dialettale
        r'il\s*mio\s*nome',       # "il mio nome"
        r'mio\s*nome',            # "mio nome"
        r'chiamo\s*\w+',          # "chiamo Mario"
        r'chiamami',
        r'contattami',
        r'scrivimi',
        r'chiama\s*me',
        r'scrivi\s*a',
        r'io\s+sono',             # "io sono"
        r'mi\s+presento',         # "mi presento"
        r'piacere\s*,',           # "piacere,"
        r'ciao\s+sono',           # "ciao sono"
        r'salve\s+sono',          # "salve sono"
        r'hey\s+sono',            # "hey sono"
        r'mi\s+dico',             # "mi dico"
        r'sono\s+io',             # "sono io"
        r'nome\s+è',              # "nome è"
        r'nome\s*:',              # "nome:"
    ]
    for pattern in name_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 5b. Blocca "sono + NOME" solo se seguito da un nome dalla lista
    for nome in NOMI_ITALIANI:
        sono_nome_pattern = rf'\bsono\s+{nome}\b'
        if re.search(sono_nome_pattern, content_lower):
            return False, error_msg
    
    # 6. Blocca social media e app di messaggistica
    social_patterns = [
        r'\binstagram\b', r'\binsta\b', r'\big\s*:',
        r'\btelegram\b', r'\btg\s*:', r'\bt\.me\b',
        r'\bwhatsapp\b', r'\bwa\s*:', r'\bwhats\s*app\b', r'\bwapp\b',
        r'\bfacebook\b', r'\bfb\s*:',
        r'\btiktok\b', r'\btik\s*tok\b',
        r'\btwitter\b', r'\bx\.com\b',
        r'\bsnapchat\b', r'\bsnap\s*:',
        r'\blinkedin\b',
        r'\byoutube\b', r'\byt\s*:',
        r'\bdiscord\b',
        r'\bsignal\b',
        r'\bviber\b',
        r'\bskype\b',
        r'\bmessenger\b',
        r'\bwechat\b',
        r'\bline\b(?!\s+di)',
        r'\bthreads\b',
    ]
    for pattern in social_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 7. Blocca pattern di username social (@username, username:, ecc)
    username_patterns = [
        r'@[a-zA-Z0-9_\.]+',
        r'\busername\b',
        r'\bprofilo\b',
        r'\baccount\b',
        r'\bnick\b',
        r'\bnickname\b',
        r'\buser\s*:\b',
        r'\bid\s*:\b',
    ]
    for pattern in username_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 8. Blocca tentativi di offuscare email
    obfuscated_patterns = [
        r'\bat\b.*\bdot\b',
        r'\bchiocciola\b',
        r'\[at\]', r'\(at\)', r'\{at\}',
        r'\[dot\]', r'\(dot\)', r'\{dot\}',
        r'punto\s*(it|com|net|org)',
    ]
    for pattern in obfuscated_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 9. Blocca frasi che suggeriscono scambio contatti
    contact_phrases = [
        r'\bil\s+mio\s+numero\b',
        r'\bla\s+mia\s+mail\b',
        r'\bla\s+mia\s+email\b',
        r'\bil\s+mio\s+contatto\b',
        r'\bi\s+miei\s+contatti\b',
        r'\bsu\s+whatsapp\b',
        r'\bsu\s+telegram\b',
        r'\bsu\s+instagram\b',
        r'\bscrivimi\s+su\b',
        r'\bcontattami\s+su\b',
        r'\bsentiamoci\s+su\b',
        r'\bti\s+do\s+il\b',
        r'\bti\s+lascio\s+il\b',
        r'\becco\s+il\s+mio\b',
        r'\bfuori\s+da\s+(qui|ribook|app)\b',
    ]
    for pattern in contact_phrases:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 10. Blocca URL e link
    url_patterns = [
        r'https?://',
        r'www\.',
        r'\.[a-z]{2,4}/',
        r'bit\.ly', r'tinyurl', r'goo\.gl',
    ]
    for pattern in url_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    # 11. Blocca indirizzi stradali (via, piazza, viale, etc.)
    address_patterns = [
        r'\b(via|v\.)\s+[a-zA-Z]',
        r'\b(viale|v\.le)\s+[a-zA-Z]',
        r'\b(piazza|p\.zza|p\.za|piazzale|p\.le)\s+[a-zA-Z]',
        r'\b(corso|c\.so)\s+[a-zA-Z]',
        r'\b(largo|l\.go)\s+[a-zA-Z]',
        r'\b(vicolo|vic\.)\s+[a-zA-Z]',
        r'\b(trav|traversa)\s+[a-zA-Z]',
        r'\b(contrada|c\.da)\s+[a-zA-Z]',
        r'\b(strada|str\.)\s+[a-zA-Z]',
        r'\b(loc|località)\s+[a-zA-Z]',
    ]
    for pattern in address_patterns:
        if re.search(pattern, content_lower):
            return False, error_msg
    
    return True, ""


@api_router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, data: MessageCreate):
    """Send a message in a conversation"""
    # Verify conversation exists
    conversation = await db.conversations.find_one({"id": conversation_id})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    
    # Verify sender is part of the conversation
    if data.sender_id not in [conversation["buyer_id"], conversation["seller_id"]]:
        raise HTTPException(status_code=403, detail="Non sei parte di questa conversazione")
    
    # Get sender info
    sender = await db.users.find_one({"id": data.sender_id})
    if not sender:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    # FILTRO MESSAGGI: Verifica contenuto
    is_valid, error_message = check_message_content(
        content=data.content,
        sender_name=sender.get("nome", ""),
        other_user_name=""  # Potremmo recuperare il nome dell'altro utente se necessario
    )
    
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_message)
    
    # Create message
    message = ConversationMessage(
        conversation_id=conversation_id,
        sender_id=data.sender_id,
        sender_username=sender.get("username", "Utente"),
        content=data.content
    )
    
    await db.messages.insert_one(message.dict())
    
    # Update conversation with last message
    await db.conversations.update_one(
        {"id": conversation_id},
        {"$set": {
            "last_message": data.content[:100],  # Truncate for preview
            "last_message_at": message.created_at
        }}
    )
    
    # I messaggi NON creano notifiche - vengono mostrati solo nella sezione Messaggi
    # Il badge dei messaggi non letti viene calcolato direttamente dalle conversazioni
    
    return {"message": message.dict()}


@api_router.post("/conversations/{conversation_id}/read")
async def mark_messages_as_read(conversation_id: str, data: dict):
    """Mark all messages in a conversation as read for a user"""
    user_id = data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id richiesto")
    
    # Mark all messages from the other user as read
    result = await db.messages.update_many(
        {
            "conversation_id": conversation_id,
            "sender_id": {"$ne": user_id},
            "read": False
        },
        {"$set": {"read": True}}
    )
    
    return {"marked_read": result.modified_count}


# ============================================================
# ENDPOINT DOWNLOAD LISTE LIBRI
# ============================================================
from fastapi.responses import FileResponse

@api_router.get("/downloads/liste-pdf-2026-2027")
async def download_liste_pdf():
    """Scarica ZIP con tutti i PDF delle liste 2026/2027"""
    filepath = "/app/downloads/liste_pdf_2026_2027.zip"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="application/zip",
            filename="liste_libri_catanzaro_2026_2027.zip"
        )
    raise HTTPException(status_code=404, detail="File non trovato")

@api_router.get("/downloads/liste-pdf-2025-2026")
async def download_liste_pdf_2025():
    """Scarica ZIP con tutti i PDF delle liste 2025/2026"""
    filepath = "/app/downloads/liste_pdf_2025_2026.zip"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="application/zip",
            filename="liste_libri_catanzaro_2025_2026.zip"
        )
    raise HTTPException(status_code=404, detail="File non trovato. Genera prima i PDF.")

@api_router.post("/admin/genera-pdf-2025-2026")
async def genera_pdf_2025_2026():
    """Genera ZIP con tutti i PDF delle liste 2025/2026"""
    import zipfile
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm, cm
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from io import BytesIO
    
    try:
        # Mappa codici scuola -> nomi
        scuole_map = {
            "CZMM00300E": "IC_Don_Milani",
            "CZMM86001P": "IC_Casalinuovo",
            "CZMM85201Q": "IC_Mater_Domini",
            "CZMM86701D": "IC_Patari_Rodari",
            "CZMM85801P": "IC_Catanzaro_Est",
            "CZMM856013": "IC_Catanzaro_Nord_Est",
            "CZMM83903B": "IC_Pascoli_Aldisio",
            "CZ1MBR5002": "Convitto_Nazionale_Galluppi",
            "CZPS00101C": "Liceo_Scientifico_Fermi",
            "CZPM00101D": "Liceo_Classico_Galluppi",
            "CZPM02201E": "Liceo_Scienze_Umane_De_Nobili",
            "CZPC09000X": "Liceo_Classico_Cicala",
            "CZSL02201A": "Liceo_Artistico_Catanzaro",
            "CZTF010008": "ITIS_Scalfaro",
            "CZTE021011": "ITG_Ferraris",
            "CZTD024011": "ITC_Ferraris",
            "CZTA021035": "ITA_Catanzaro",
            "CZPS02201D": "Liceo_Siciliani",
            "CZRC02401N": "Ipssar_Catanzaro",
            "CZRI02401A": "IPSIA_Catanzaro",
            "CZTL02401B": "ITI_Catanzaro",
        }
        
        # Directory output
        os.makedirs("/app/downloads", exist_ok=True)
        zip_path = "/app/downloads/liste_pdf_2025_2026.zip"
        
        # Trova tutte le scuole uniche nel dataset 2025/2026
        codici_scuola = await db.adozioni_2025_2026.distinct("codice_scuola")
        
        pdf_files = []
        
        for codice in codici_scuola:
            # Salta scuole con pochi dati
            count = await db.adozioni_2025_2026.count_documents({"codice_scuola": codice})
            if count < 3:
                continue
            
            nome_file = scuole_map.get(codice, codice)
            
            # Raccogli tutti i libri di questa scuola
            libri_scuola = []
            async for doc in db.adozioni_2025_2026.find({"codice_scuola": codice}):
                classe = doc.get('classe', '')
                sezione = doc.get('sezione', '')
                for libro in doc.get('libri', []):
                    libro['classe'] = classe
                    libro['sezione'] = sezione
                    libri_scuola.append(libro)
            
            if not libri_scuola:
                continue
            
            # Rimuovi duplicati per ISBN
            libri_unici = {}
            for libro in libri_scuola:
                isbn = libro.get('isbn', '')
                if isbn and isbn not in libri_unici:
                    libri_unici[isbn] = libro
            
            libri_list = list(libri_unici.values())
            
            # Genera PDF
            buffer = BytesIO()
            doc = SimpleDocTemplate(
                buffer,
                pagesize=landscape(A4),
                rightMargin=1*cm,
                leftMargin=1*cm,
                topMargin=1*cm,
                bottomMargin=1*cm
            )
            
            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=14,
                alignment=TA_CENTER,
                spaceAfter=10
            )
            
            elements = []
            
            # Titolo
            elements.append(Paragraph(f"Lista Libri 2025/2026 - {nome_file.replace('_', ' ')}", title_style))
            elements.append(Spacer(1, 10))
            
            # Tabella
            headers = ["ISBN", "Titolo", "Autori", "Editore", "Disciplina", "Prezzo", "Cl.", "Vol."]
            data = [headers]
            
            for libro in sorted(libri_list, key=lambda x: (x.get('disciplina', ''), x.get('titolo', ''))):
                titolo = libro.get('titolo', '')[:45]
                autori = libro.get('autori', '')[:25]
                editore = libro.get('editore', '')[:20]
                prezzo = libro.get('prezzo_copertina', 0)
                prezzo_str = f"€{prezzo:.2f}" if prezzo else "-"
                
                data.append([
                    libro.get('isbn', ''),
                    titolo,
                    autori,
                    editore,
                    libro.get('disciplina', '')[:20],
                    prezzo_str,
                    str(libro.get('classe', '')),
                    libro.get('volume', '')
                ])
            
            col_widths = [85, 180, 100, 80, 100, 45, 25, 25]
            table = Table(data, colWidths=col_widths, repeatRows=1)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1B5E20')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 8),
                ('FONTSIZE', (0, 1), (-1, -1), 7),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('ALIGN', (5, 0), (7, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('LEFTPADDING', (0, 0), (-1, -1), 3),
                ('RIGHTPADDING', (0, 0), (-1, -1), 3),
                ('TOPPADDING', (0, 0), (-1, -1), 2),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ]))
            
            elements.append(table)
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(f"Totale libri: {len(libri_list)}", styles['Normal']))
            
            doc.build(elements)
            
            pdf_files.append({
                "nome": f"{nome_file}_2025_2026.pdf",
                "data": buffer.getvalue()
            })
        
        # Crea ZIP
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for pdf in pdf_files:
                zipf.writestr(pdf["nome"], pdf["data"])
        
        return {
            "success": True,
            "message": f"Generati {len(pdf_files)} PDF",
            "file_path": zip_path
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/downloads/lista-csv-2026-2027")
async def download_csv_2026():
    """Scarica CSV lista 2026/2027"""
    filepath = "/app/downloads/libri_catanzaro_2026_2027.csv"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="text/csv",
            filename="libri_catanzaro_2026_2027.csv"
        )
    raise HTTPException(status_code=404, detail="File non trovato")

@api_router.get("/downloads/lista-csv-2025-2026")
async def download_csv_2025():
    """Scarica CSV lista 2025/2026"""
    filepath = "/app/downloads/libri_catanzaro_2025_2026.csv"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="text/csv",
            filename="libri_catanzaro_2025_2026.csv"
        )
    raise HTTPException(status_code=404, detail="File non trovato")

@api_router.get("/downloads/scalfaro-1a-2025-2026")
async def download_scalfaro_1a():
    """Scarica PDF Scalfaro 1A 2025/2026"""
    filepath = "/app/downloads/Scalfaro_1A_2025_2026.pdf"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="application/pdf",
            filename="Scalfaro_1A_2025_2026.pdf"
        )
    raise HTTPException(status_code=404, detail="File non trovato")

@api_router.get("/downloads/scalfaro-2a-2025-2026")
async def download_scalfaro_2a():
    """Scarica PDF Scalfaro 2A 2025/2026"""
    filepath = "/app/downloads/Scalfaro_2A_2025_2026.pdf"
    if os.path.exists(filepath):
        return FileResponse(
            filepath,
            media_type="application/pdf",
            filename="Scalfaro_2A_2025_2026.pdf"
        )
    raise HTTPException(status_code=404, detail="File non trovato")

# ==================== BOOKSTORE PANEL ENDPOINTS ====================

@api_router.post("/bookstore/login")
async def bookstore_login(data: dict):
    """Login per cartolibreria"""
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    
    bookstore = await db.bookstores.find_one({"email": email})
    if not bookstore:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    # Verifica password (per ora semplice, in produzione usare bcrypt)
    stored_password = bookstore.get("password", "")
    if password != stored_password:
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    
    return {
        "success": True,
        "bookstore_id": bookstore.get("id"),
        "bookstore": {
            "id": bookstore.get("id"),
            "nome": bookstore.get("nome"),
            "indirizzo": bookstore.get("indirizzo"),
            "email": bookstore.get("email")
        }
    }

@api_router.get("/bookstore/{bookstore_id}")
async def get_bookstore_info(bookstore_id: str):
    """Info cartolibreria"""
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    bookstore.pop("_id", None)
    bookstore.pop("password", None)
    return bookstore

@api_router.get("/bookstore/{bookstore_id}/stats")
async def get_bookstore_stats(bookstore_id: str):
    """Statistiche cartolibreria con sistema credito"""
    from datetime import datetime, timedelta
    
    # Recupera cartolibreria per i dati credito
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Ordini in attesa di consegna dal venditore
    pending_deliveries = await db.orders.count_documents({
        "bookstore_id": bookstore_id,
        "status": {"$in": ["paid", "awaiting_seller_delivery"]}
    })
    
    # Ordini consegnati, in attesa di ritiro acquirente
    awaiting_pickup = await db.orders.count_documents({
        "bookstore_id": bookstore_id,
        "status": "ready_for_pickup"
    })
    
    # Completati oggi
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    completed_today = await db.orders.count_documents({
        "bookstore_id": bookstore_id,
        "status": "completed",
        "completed_at": {"$gte": today_start}
    })
    
    # Resi in attesa
    returns_pending = await db.orders.count_documents({
        "bookstore_id": bookstore_id,
        "status": "return_requested"
    })
    
    # Guadagni del mese (dalla collezione ordini)
    month_start = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": "completed",
        "completed_at": {"$gte": month_start}
    }).to_list(None)
    
    monthly_earnings = sum(o.get("commissione_cartolibreria", 0) for o in monthly_orders)
    
    # Dati sistema credito
    credito_commissioni = bookstore.get("credito_commissioni", 0)
    credito_foderazione = bookstore.get("credito_foderazione", 0)
    credito_totale = bookstore.get("credito_totale", 0)
    
    return {
        "pending_deliveries": pending_deliveries,
        "awaiting_pickup": awaiting_pickup,
        "completed_today": completed_today,
        "returns_pending": returns_pending,
        "monthly_earnings": monthly_earnings,
        "monthly_transactions": len(monthly_orders),
        # Sistema credito
        "credito": {
            "commissioni_libro": round(credito_commissioni, 2),
            "foderazione": round(credito_foderazione, 2),
            "totale": round(credito_totale, 2)
        }
    }

@api_router.get("/bookstore/{bookstore_id}/orders/pending")
async def get_bookstore_pending_orders(bookstore_id: str):
    """Ordini in attesa di consegna dal venditore"""
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": {"$in": ["paid", "awaiting_seller_delivery"]}
    }).sort("created_at", -1).to_list(100)
    
    result = []
    for o in orders:
        o.pop("_id", None)
        result.append({
            "id": o.get("id"),
            "order_code": o.get("order_code"),
            "book_titolo": o.get("book_titolo"),
            "book_isbn": o.get("book_isbn"),
            "buyer_name": o.get("buyer_name", "Acquirente"),
            "seller_name": o.get("seller_name", "Venditore"),
            "prezzo_acquirente": o.get("prezzo_acquirente"),
            "status": o.get("status"),
            "created_at": o.get("created_at"),
            "seller_delivery_deadline": o.get("seller_delivery_deadline")
        })
    return result

@api_router.get("/bookstore/{bookstore_id}/orders/delivered")
async def get_bookstore_delivered_orders(bookstore_id: str):
    """Ordini consegnati, in attesa di ritiro"""
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": "ready_for_pickup"
    }).sort("delivered_to_bookstore_at", -1).to_list(100)
    
    result = []
    for o in orders:
        o.pop("_id", None)
        result.append({
            "id": o.get("id"),
            "order_code": o.get("order_code"),
            "book_titolo": o.get("book_titolo"),
            "book_isbn": o.get("book_isbn"),
            "buyer_name": o.get("buyer_name", "Acquirente"),
            "prezzo_acquirente": o.get("prezzo_acquirente"),
            "status": o.get("status"),
            "delivered_to_bookstore_at": o.get("delivered_to_bookstore_at")
        })
    return result

@api_router.get("/bookstore/{bookstore_id}/orders/completed")
async def get_bookstore_completed_orders(bookstore_id: str):
    """Ordini completati"""
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": "completed"
    }).sort("completed_at", -1).to_list(100)
    
    result = []
    for o in orders:
        o.pop("_id", None)
        result.append({
            "id": o.get("id"),
            "order_code": o.get("order_code"),
            "book_titolo": o.get("book_titolo"),
            "prezzo_acquirente": o.get("prezzo_acquirente"),
            "status": o.get("status"),
            "created_at": o.get("created_at"),
            "completed_at": o.get("completed_at")
        })
    return result

@api_router.get("/bookstore/{bookstore_id}/returns")
async def get_bookstore_returns(bookstore_id: str):
    """Resi"""
    orders = await db.orders.find({
        "bookstore_id": bookstore_id,
        "status": {"$in": ["return_requested", "returned"]}
    }).sort("created_at", -1).to_list(100)
    
    result = []
    for o in orders:
        o.pop("_id", None)
        result.append({
            "id": o.get("id"),
            "order_code": o.get("order_code"),
            "book_titolo": o.get("book_titolo"),
            "prezzo_acquirente": o.get("prezzo_acquirente"),
            "status": o.get("status"),
            "return_reason": o.get("return_reason")
        })
    return result

@api_router.post("/bookstore/{bookstore_id}/confirm-delivery/{order_id}")
async def bookstore_confirm_delivery(bookstore_id: str, order_id: str):
    """Conferma ricezione libro dal venditore"""
    from datetime import datetime
    
    order = await db.orders.find_one({"id": order_id, "bookstore_id": bookstore_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "ready_for_pickup",
            "delivered_to_bookstore_at": datetime.now(),
            "bookstore_verified_at": datetime.now()
        }}
    )
    
    # Notifica all'acquirente
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": order.get("buyer_id"),
        "type": "ready_for_pickup",
        "title": "Libro pronto per il ritiro!",
        "message": f"Il libro '{order.get('book_titolo')}' è pronto per il ritiro presso la cartolibreria.",
        "data": {
            "order_id": order_id,
            "order_code": order.get("order_code"),
            "bookstore_name": order.get("bookstore_name")
        },
        "order_code": order.get("order_code"),
        "bookstore_name": order.get("bookstore_name"),
        "read": False,
        "created_at": datetime.now()
    })
    
    return {"success": True, "message": "Consegna confermata"}

# ============== ENDPOINT STORICO CREDITI CARTOLIBRERIA ==============

@api_router.get("/bookstore/{bookstore_id}/credit-history")
async def get_bookstore_credit_history(bookstore_id: str, limit: int = 50):
    """Storico movimenti credito cartolibreria"""
    
    bookstore = await db.bookstores.find_one({"id": bookstore_id})
    if not bookstore:
        raise HTTPException(status_code=404, detail="Cartolibreria non trovata")
    
    # Recupera i log dei movimenti
    credit_logs = await db.bookstore_credit_logs.find({
        "bookstore_id": bookstore_id
    }).sort("created_at", -1).to_list(limit)
    
    for log in credit_logs:
        log.pop("_id", None)
    
    return {
        "bookstore_id": bookstore_id,
        "bookstore_nome": bookstore.get("nome"),
        "credito_attuale": {
            "commissioni_libro": round(bookstore.get("credito_commissioni", 0), 2),
            "foderazione": round(bookstore.get("credito_foderazione", 0), 2),
            "totale": round(bookstore.get("credito_totale", 0), 2)
        },
        "movimenti": credit_logs,
        "count": len(credit_logs)
    }

@api_router.get("/admin/bookstores-credits")
async def get_all_bookstores_credits():
    """Admin: visualizza crediti di tutte le cartolibrerie"""
    
    bookstores = await db.bookstores.find({}).to_list(None)
    
    result = []
    for bs in bookstores:
        result.append({
            "id": bs.get("id"),
            "nome": bs.get("nome"),
            "citta": bs.get("citta"),
            "credito_commissioni": round(bs.get("credito_commissioni", 0), 2),
            "credito_foderazione": round(bs.get("credito_foderazione", 0), 2),
            "credito_totale": round(bs.get("credito_totale", 0), 2)
        })
    
    # Totali globali
    totale_commissioni = sum(bs.get("credito_commissioni", 0) for bs in bookstores)
    totale_foderazione = sum(bs.get("credito_foderazione", 0) for bs in bookstores)
    totale_crediti = sum(bs.get("credito_totale", 0) for bs in bookstores)
    
    return {
        "cartolibrerie": result,
        "totali_globali": {
            "commissioni_libro": round(totale_commissioni, 2),
            "foderazione": round(totale_foderazione, 2),
            "totale": round(totale_crediti, 2)
        },
        "count": len(result)
    }

@api_router.post("/admin/clear-all-data")
async def admin_clear_all_data(admin_id: str = Query(...)):
    """
    Admin: Svuota dati transazionali dal database.
    
    ⚠️ PROTEZIONE: Le seguenti collezioni NON vengono MAI cancellate:
    - books (dati MIUR 2025/2026)
    - adozioni (dati MIUR 2026/2027)
    - schools (19 scuole target)
    - users (utenti registrati)
    - bookstores (cartolibrerie)
    """
    
    # Verifica admin
    admin = await db.users.find_one({"id": admin_id, "is_admin": True})
    if not admin:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    # COLLEZIONI PROTETTE - MAI CANCELLARE
    PROTECTED = {'books', 'adozioni', 'schools', 'users', 'bookstores'}
    
    # Collezioni da svuotare (solo dati transazionali)
    collections_to_clear = [
        "notifications",
        "bookstore_notifications",
        "orders",
        "cart_items",
        "listings",
        "conversations",
        "messages",
        "profiles",
        "bookstore_credit_logs",
        "transactions",
        "exchanges",
        "reservations",
        "radar_alerts",
        "wishlists"
    ]
    
    # Doppia verifica: rimuovi qualsiasi collezione protetta dalla lista
    collections_to_clear = [c for c in collections_to_clear if c not in PROTECTED]
    
    deleted_counts = {}
    for coll in collections_to_clear:
        try:
            result = await db[coll].delete_many({})
            deleted_counts[coll] = result.deleted_count
        except Exception as e:
            deleted_counts[coll] = f"error: {str(e)}"
    
    # Reset crediti cartolibrerie
    await db.bookstores.update_many({}, {"$set": {
        "credito_commissioni": 0,
        "credito_foderazione": 0,
        "credito_totale": 0
    }})
    
    return {
        "success": True,
        "message": "Database svuotato",
        "deleted": deleted_counts
    }

@api_router.post("/bookstore/{bookstore_id}/confirm-pickup/{order_id}")
async def bookstore_confirm_pickup(bookstore_id: str, order_id: str):
    """Conferma ritiro libro dall'acquirente"""
    from datetime import datetime
    
    order = await db.orders.find_one({"id": order_id, "bookstore_id": bookstore_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.now()
        }}
    )
    
    # Notifica al venditore (pagamento in arrivo)
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": order.get("seller_id"),
        "type": "order_completed",
        "title": "Vendita completata!",
        "message": f"L'acquirente ha ritirato '{order.get('book_titolo')}'. Il pagamento sarà accreditato a breve.",
        "data": {"order_id": order_id},
        "read": False,
        "created_at": datetime.now()
    })
    
    return {"success": True, "message": "Ritiro confermato"}

@api_router.post("/bookstore/{bookstore_id}/return/{order_id}")
async def bookstore_register_return(bookstore_id: str, order_id: str, data: dict):
    """Registra reso"""
    from datetime import datetime
    
    order = await db.orders.find_one({"id": order_id, "bookstore_id": bookstore_id})
    if not order:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    
    reason = data.get("reason", "Non specificato")
    
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "returned",
            "return_reason": reason,
            "returned_at": datetime.now()
        }}
    )
    
    return {"success": True, "message": "Reso registrato"}


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
