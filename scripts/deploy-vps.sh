#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ribook}"
ENV_FILE="${APP_DIR}/deploy.env"
COMPOSE_FILE="${APP_DIR}/docker-compose.prod.yml"

cd "${APP_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null || true
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
fi

mkdir -p "${APP_DIR}/downloads"

# Crea deploy.env solo se non esiste (per non sovrascrivere configurazioni esistenti)
if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" <<'ENV'
APP_SITE_ADDRESS=ribook.it, www.ribook.it
EXPO_PUBLIC_BACKEND_URL=https://ribook.it
DB_NAME=ribook
MONGO_URL=mongodb://mongo:27017/ribook
ADMIN_PASSWORD=CambiaMiInProduzione123!
STRIPE_SECRET_KEY=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
STRIPE_PUBLISHABLE_KEY=pk_live_51TmUU9HYnbqrgFr2Vcs4UvKZhDgbtvsouPraSdgtV0CYuUlS8rdBSFodzU6abm09e4ecZbFb6EFu1qNAgKGvacnK00AyzCTLmT
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51TmUU9HYnbqrgFr2Vcs4UvKZhDgbtvsouPraSdgtV0CYuUlS8rdBSFodzU6abm09e4ecZbFb6EFu1qNAgKGvacnK00AyzCTLmT
ENV
  chmod 600 "${ENV_FILE}"
fi

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --build --remove-orphans
docker image prune -f >/dev/null

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps
