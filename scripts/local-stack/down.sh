#!/usr/bin/env bash
# Desliga o Supabase local iniciado por up.sh (os dados ficam em .local-stack/pgdata).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK="$ROOT/.local-stack"
PGDATA="$STACK/pgdata"
PG_OS_USER="${PG_OS_USER:-postgres}"

for name in proxy postgrest auth; do
  pidfile="$STACK/$name.pid"
  if [[ -f "$pidfile" ]]; then
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
  fi
done

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [[ -f "$PGDATA/PG_VERSION" && -x "$PG_BIN/pg_ctl" ]]; then
  if [[ "$(id -u)" -eq 0 ]]; then
    runuser -u "$PG_OS_USER" -- "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  else
    "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  fi
fi

echo "Supabase local desligado."
