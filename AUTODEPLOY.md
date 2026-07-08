# Autodeploy VPS

Il deploy automatico usa GitHub Actions. A ogni push su `main`, il workflow copia il repository sulla VPS e lancia Docker Compose.

## GitHub Secrets

Nel repository GitHub vai in:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Crea questi secret:

```text
VPS_HOST=94.177.161.18
VPS_USER=root
VPS_PASSWORD=<password SSH della VPS>
APP_DIR=/opt/ribook
```

Non serve salvare un token GitHub sulla VPS: il workflow parte dal repository privato e copia i file via SSH.

## Primo deploy

Dopo aver aggiunto i secret:

```bash
git add .
git commit -m "Add VPS Docker autodeploy"
git push origin main
```

Poi apri la tab `Actions` del repository e avvia/controlla `Deploy VPS`.

Senza dominio l'app sara disponibile in HTTP:

```text
http://94.177.161.18
http://94.177.161.18/docs
```

## Quando avrai un dominio

Punta il record `A` del dominio all'IP della VPS, poi modifica sulla VPS:

```bash
cd /opt/ribook
nano .env
```

Cambia:

```env
APP_SITE_ADDRESS=:80
EXPO_PUBLIC_BACKEND_URL=http://94.177.161.18
```

in:

```env
APP_SITE_ADDRESS=tuodominio.it
EXPO_PUBLIC_BACKEND_URL=https://tuodominio.it
```

Poi rilancia:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

Caddy generera automaticamente il certificato HTTPS.

## Note sicurezza

La password SSH e il token GitHub condivisi in chat vanno considerati compromessi. Dopo il primo deploy, cambia la password root e revoca il token GitHub. Per produzione e preferibile passare a una chiave SSH e a un utente `deploy` senza login root diretto.
