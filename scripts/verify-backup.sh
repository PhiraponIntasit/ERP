#!/bin/sh
# Restore a pg_dump (custom format) into a scratch database and prove it is usable:
# migrations present, row counts, and the money & stock invariants in scripts/integrity.sql.
#   scripts/verify-backup.sh erp-20261121-1900.dump postgresql://user:pass@localhost:5432/postgres
# The second argument is a server the dump can be restored onto (its database is only used to create/drop the scratch one).
set -eu
DUMP="$1"; ADMIN="$2"
DIR=$(dirname "$0"); NAME="restore_check_$$"
SCRATCH=$(printf '%s' "$ADMIN" | sed -E "s#/[^/?]+(\?|$)#/$NAME\1#")
psql "$ADMIN" -qc "CREATE DATABASE $NAME" >/dev/null
trap 'psql "$ADMIN" -qc "DROP DATABASE IF EXISTS $NAME" >/dev/null' EXIT
pg_restore --no-owner --exit-on-error -d "$SCRATCH" "$DUMP"
echo "── restored $(basename "$DUMP")"
psql "$SCRATCH" -Atc 'SELECT COUNT(*) || '"' migrations applied, last: '"' || MAX("migration_name") FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL'
psql "$SCRATCH" -At -F ' ' -c "SELECT 'orders', COUNT(*) FROM \"Order\" UNION ALL SELECT 'payments', COUNT(*) FROM \"Payment\" UNION ALL SELECT 'products', COUNT(*) FROM \"InventoryItem\" UNION ALL SELECT 'serials', COUNT(*) FROM \"SerialNumber\" UNION ALL SELECT 'audit log', COUNT(*) FROM \"AuditLog\""
BAD=$(psql "$SCRATCH" -At -F ' | ' -f "$DIR/integrity.sql")
if [ -n "$BAD" ]; then echo "── integrity problems:"; echo "$BAD"; exit 1; fi
echo "── integrity checks: OK"
