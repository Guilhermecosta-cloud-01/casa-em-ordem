#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Supabase local SEM Docker, para testes automatizados (Linux x86-64).
# Sobe: Postgres (instalado no sistema) + Supabase Auth + PostgREST + proxy
# em http://localhost:54321, imitando o endereço de um projeto Supabase.
#
#   npm run stack:up            sobe e aplica as migrações pendentes
#   RESET=1 npm run stack:up    apaga o banco local e recria do zero
#   npm run stack:down          desliga tudo
#
# Para desenvolver no dia a dia, prefira o Supabase CLI (`npx supabase start`),
# que usa Docker e inclui Realtime e Studio. Veja docs/SUPABASE.md.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="$ROOT/.local-stack"
BIN="$STACK/bin"
LOGS="$STACK/logs"
PGDATA="$STACK/pgdata"

AUTH_VERSION="${AUTH_VERSION:-v2.197.0}"
POSTGREST_VERSION="${POSTGREST_VERSION:-v12.2.3}"
PG_PORT="${PG_PORT:-54322}"
AUTH_PORT="${AUTH_PORT:-9999}"
REST_PORT="${REST_PORT:-3000}"
PROXY_PORT="${PROXY_PORT:-54321}"
SITE_URL="${SITE_URL:-http://localhost:4173}"
JWT_SECRET="${JWT_SECRET:-casa-em-ordem-segredo-local-de-testes-com-mais-de-32-caracteres}"
PG_OS_USER="${PG_OS_USER:-postgres}"

if [[ "${RESET:-0}" == "1" ]]; then
  bash "$ROOT/scripts/local-stack/down.sh" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
fi

mkdir -p "$BIN" "$LOGS"

# --- Binários do Postgres -------------------------------------------------
PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]]; then
  PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [[ -z "$PG_BIN" ]] && command -v pg_config >/dev/null 2>&1; then PG_BIN="$(pg_config --bindir)"; fi
fi
if [[ ! -x "$PG_BIN/initdb" ]]; then
  echo "PostgreSQL 15+ não encontrado. Instale (ex.: apt install postgresql) ou defina PG_BIN." >&2
  exit 1
fi

# O Postgres se recusa a rodar como root; nesse caso usamos o usuário "postgres".
as_pg() {
  if [[ "$(id -u)" -eq 0 ]]; then runuser -u "$PG_OS_USER" -- "$@"; else "$@"; fi
}

download() {
  curl -fsSL --retry 3 --max-time 300 -o "$2" "$1"
}

# --- Supabase Auth e PostgREST ------------------------------------------
if [[ ! -x "$BIN/auth" ]]; then
  echo "Baixando Supabase Auth $AUTH_VERSION..."
  tmp="$(mktemp -d)"
  download "https://github.com/supabase/auth/releases/download/$AUTH_VERSION/auth-$AUTH_VERSION-x86.tar.gz" "$tmp/auth.tar.gz"
  tar -xzf "$tmp/auth.tar.gz" -C "$tmp"
  mv "$tmp/auth" "$BIN/auth"
  rm -rf "$BIN/auth-migrations"
  mv "$tmp/migrations" "$BIN/auth-migrations"
  rm -rf "$tmp"
fi

if [[ ! -x "$BIN/postgrest" ]]; then
  echo "Baixando PostgREST $POSTGREST_VERSION..."
  tmp="$(mktemp -d)"
  download "https://github.com/PostgREST/postgrest/releases/download/$POSTGREST_VERSION/postgrest-$POSTGREST_VERSION-linux-static-x64.tar.xz" "$tmp/postgrest.tar.xz"
  tar -xJf "$tmp/postgrest.tar.xz" -C "$BIN"
  rm -rf "$tmp"
fi

# --- Postgres -------------------------------------------------------------
if [[ ! -f "$PGDATA/PG_VERSION" ]]; then
  echo "Criando o banco local..."
  mkdir -p "$PGDATA"
  if [[ "$(id -u)" -eq 0 ]]; then chown -R "$PG_OS_USER" "$PGDATA"; fi
  as_pg "$PG_BIN/initdb" -D "$PGDATA" -U postgres --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
fi

if ! as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  as_pg "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/postgres.log" -w \
    -o "-p $PG_PORT -k /tmp -c listen_addresses=127.0.0.1 -c wal_level=logical" start >/dev/null
fi

PSQL=(psql -h 127.0.0.1 -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/scripts/local-stack/bootstrap.sql" >/dev/null

# --- Migrações do Auth -------------------------------------------------------
AUTH_ENV=(
  "API_EXTERNAL_URL=http://localhost:$PROXY_PORT/auth/v1"
  "GOTRUE_API_HOST=127.0.0.1"
  "PORT=$AUTH_PORT"
  "GOTRUE_DB_DRIVER=postgres"
  "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:postgres@127.0.0.1:$PG_PORT/postgres?sslmode=disable"
  "GOTRUE_DB_NAMESPACE=auth"
  "GOTRUE_DB_MIGRATIONS_PATH=$BIN/auth-migrations"
  "GOTRUE_SITE_URL=$SITE_URL"
  "GOTRUE_URI_ALLOW_LIST=http://localhost:4173/**,http://localhost:5173/**"
  "GOTRUE_DISABLE_SIGNUP=false"
  "GOTRUE_JWT_SECRET=$JWT_SECRET"
  "GOTRUE_JWT_EXP=3600"
  "GOTRUE_JWT_AUD=authenticated"
  "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated"
  "GOTRUE_JWT_ADMIN_ROLES=service_role"
  "GOTRUE_EXTERNAL_EMAIL_ENABLED=true"
  "GOTRUE_MAILER_AUTOCONFIRM=true"
  "GOTRUE_SMTP_ADMIN_EMAIL=admin@casa-em-ordem.local"
  "GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS=10000"
  "GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000"
  "GOTRUE_RATE_LIMIT_VERIFY=10000"
  "GOTRUE_LOG_LEVEL=warn"
)

env "${AUTH_ENV[@]}" "$BIN/auth" migrate >"$LOGS/auth-migrate.log" 2>&1 || {
  echo "Falha nas migrações do Auth (veja $LOGS/auth-migrate.log)" >&2
  exit 1
}

# --- Migrações do app ----------------------------------------------------------
for file in "$ROOT"/supabase/migrations/*.sql; do
  name="$(basename "$file")"
  version="${name%%_*}"
  applied="$("${PSQL[@]}" -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'")"
  if [[ "$applied" != "1" ]]; then
    echo "Aplicando migração $name"
    "${PSQL[@]}" --single-transaction -f "$file" >/dev/null
    "${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')" >/dev/null
  fi
done

# --- Serviços ------------------------------------------------------------------
start_bg() {
  local name="$1"
  shift
  if [[ -f "$STACK/$name.pid" ]] && kill -0 "$(cat "$STACK/$name.pid")" 2>/dev/null; then
    return 0
  fi
  nohup "$@" >"$LOGS/$name.log" 2>&1 &
  echo $! >"$STACK/$name.pid"
}

wait_for() {
  local url="$1"
  for _ in $(seq 1 80); do
    if curl -fs -o /dev/null "$url"; then return 0; fi
    sleep 0.25
  done
  echo "Serviço não respondeu: $url" >&2
  return 1
}

cat >"$STACK/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PG_PORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
db-max-rows = 1000
db-pool = 10
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = $REST_PORT
log-level = "warn"
EOF

start_bg auth env "${AUTH_ENV[@]}" "$BIN/auth" serve
start_bg postgrest "$BIN/postgrest" "$STACK/postgrest.conf"
start_bg proxy env PROXY_PORT="$PROXY_PORT" AUTH_PORT="$AUTH_PORT" REST_PORT="$REST_PORT" node "$ROOT/scripts/local-stack/proxy.mjs"

wait_for "http://127.0.0.1:$AUTH_PORT/health"
wait_for "http://127.0.0.1:$REST_PORT/"
wait_for "http://127.0.0.1:$PROXY_PORT/auth/v1/health"
"${PSQL[@]}" -c "notify pgrst, 'reload schema'" >/dev/null

# --- Chaves e variáveis --------------------------------------------------------
KEYS="$(cd "$ROOT" && JWT_SECRET="$JWT_SECRET" node scripts/local-stack/keys.mjs)"
ANON_KEY="$(echo "$KEYS" | sed -n 's/^ANON_KEY=//p')"
SERVICE_ROLE_KEY="$(echo "$KEYS" | sed -n 's/^SERVICE_ROLE_KEY=//p')"

cat >"$STACK/env" <<EOF
VITE_SUPABASE_URL=http://localhost:$PROXY_PORT
VITE_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DATABASE_URL=postgres://postgres@127.0.0.1:$PG_PORT/postgres
JWT_SECRET=$JWT_SECRET
EOF

echo "Supabase local pronto em http://localhost:$PROXY_PORT (variáveis em .local-stack/env)"
