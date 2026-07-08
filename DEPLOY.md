# Deploy su VPS con Docker Compose

Questa configurazione pubblica il frontend web Expo come sito statico, il backend FastAPI su rete interna Docker e MongoDB con volume persistente. Caddy espone HTTP/HTTPS e genera i certificati TLS.

## Prerequisiti VPS

- Dominio o sottodominio con record `A` verso l'IP pubblico della VPS.
- Porte `80` e `443` aperte sul firewall.
- Docker e Docker Compose installati.

Esempio Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Poi rientra via SSH.

## Configurazione

```bash
git clone <URL_DEL_REPO> ribook
cd ribook
cp deploy.env.example .env
nano .env
```

Imposta almeno:

```env
APP_DOMAIN=tuodominio.it
ACME_EMAIL=admin@tuodominio.it
DB_NAME=scambialibri
```

Se usi Stripe in produzione, sostituisci anche le chiavi `STRIPE_*`.

## Avvio

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

Controlla lo stato:

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs -f backend
```

Apri:

```text
https://tuodominio.it
https://tuodominio.it/docs
```

## Dati e backup

MongoDB usa il volume Docker `mongo_data`; i file generati dal backend in `/app/downloads` sono montati nella cartella locale `./downloads`.

Backup Mongo:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec mongo mongodump --archive=/tmp/ribook.archive
docker cp $(docker compose --env-file .env -f docker-compose.prod.yml ps -q mongo):/tmp/ribook.archive ./ribook.archive
```

Ripristino:

```bash
docker cp ./ribook.archive $(docker compose --env-file .env -f docker-compose.prod.yml ps -q mongo):/tmp/ribook.archive
docker compose --env-file .env -f docker-compose.prod.yml exec mongo mongorestore --archive=/tmp/ribook.archive --drop
```

## Aggiornamento

```bash
git pull
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```
