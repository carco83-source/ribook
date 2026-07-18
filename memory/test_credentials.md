# RiBook - Credenziali di Test

## Utenti Acquirente/Venditore
- **Email**: carco83@gmail.com
- **Password**: Test123!
- **User ID**: 58ac430d-da2a-4954-bb2f-feea6de1f30c
- **Figli**: 
  - Annarita (ID: 6189dcbf-b5af-4f46-9262-ff94b4e574ed)
  - A (ID: 7958e114-a916-4cb1-9b1c-e8a741d712e6)
  - Laica (ID: 445855bf-53c4-4c79-9725-799a124b5543)

- **Email**: nica.cartolibreria@gmail.com  
- **Password**: Test123!

## Admin
- **Email**: admin@ribook.it
- **Password**: Test123!

## Cartolibrerie Convenzionate
1. **Ni.Ca. s.a.s.**
   - Email: nica.cartolibreria@gmail.com
   - Indirizzo: Viale Magna Grecia n.179, 88100 Catanzaro
   - PEC: carto.nica@pec.it
   - P.IVA: 01696960796

2. **Russomanno Maria Cartolibreria**
   - Email: russomanno.cartolibreria@ribook.it
   - Password: 4veAEmp4
   - Indirizzo: Via Progresso 64, 88100 Catanzaro
   - Telefono: 0961 731211

3. **Libreria Punto e a capo**
   - Email: puntoeacapo@ribook.it
   - Password: RqD5Gdo4
   - Indirizzo: Via Melchiorre Jannelli, 88100 Catanzaro
   - Telefono: 0961 701727

## Note
- Password: Test123! (verificata 2026-06-14)
- Database: scambialibri
- PDF generation endpoint: /api/profiles/{user_id}/children/{child_id}/books-pdf
- Tutti i dati transazionali (listings, orders, notifications, messages) sono stati azzerati

## Google OAuth (Emergent Auth)
- Qualsiasi account Google può essere usato per il login
- Non è richiesta whitelist per il testing
- Utenti creati via Google OAuth NON hanno password locale
- Il token viene salvato in SecureStore (mobile) o localStorage (web)
