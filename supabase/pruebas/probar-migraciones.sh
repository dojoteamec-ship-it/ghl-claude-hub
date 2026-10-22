#!/usr/bin/env bash
# Aplica las migraciones dos veces en un Postgres 16 local temporal, simulando los roles de
# Supabase, y prueba restricciones, funciones y RLS. Uso: supabase/pruebas/probar-migraciones.sh
set -euo pipefail
PG=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=$(mktemp -d /tmp/pg-ghl-bot-XXXX)
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
COMO=""; [ "$(id -u)" = "0" ] && COMO="su postgres -c"
correr() { if [ -n "$COMO" ]; then $COMO "$1"; else bash -c "$1"; fi; }
chmod 777 "$DIR"
correr "$PG/initdb -D $DIR/datos -A trust -U postgres >/dev/null"
correr "$PG/pg_ctl -D $DIR/datos -o '-p 54330 -k $DIR' -l $DIR/log start >/dev/null"
trap 'correr "$PG/pg_ctl -D $DIR/datos stop -m fast >/dev/null"; rm -rf "$DIR"' EXIT
sleep 2
P="psql -h $DIR -p 54330 -U postgres -v ON_ERROR_STOP=1 -q"
cat > "$DIR/roles.sql" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
SQL
cp "$RAIZ"/supabase/migrations/*.sql "$DIR/" ; cp "$RAIZ/supabase/pruebas/verificar.sql" "$DIR/"; chmod 644 "$DIR"/*.sql
correr "$P -f $DIR/roles.sql"
for vez in 1 2; do for m in "$DIR"/2*.sql; do correr "$P -f $m" 2>&1 | grep -v NOTICE || true; done; done
correr "$P -f $DIR/verificar.sql"
echo "Migraciones verificadas."
