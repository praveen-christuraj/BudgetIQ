#!/bin/sh
# On-demand backup for a Docker Compose deployment.
#
#   ./backups/backup.sh                 # database + uploads
#   RESTORE=1 ./backups/backup.sh FILE  # documented restore helper (see below)
#
# Backups land in ./backups/db (SQL dumps) and ./backups (uploads archive).
set -eu

cd "$(dirname "$0")/.."
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p backups/db

echo "Backing up PostgreSQL..."
docker compose exec -T db sh -c 'pg_dump --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -9 > "backups/db/family_finance_${STAMP}.sql.gz"

if [ -n "${BACKUP_ENCRYPTION_PASSPHRASE:-}" ]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
    -in "backups/db/family_finance_${STAMP}.sql.gz" \
    -out "backups/db/family_finance_${STAMP}.sql.gz.enc"
  rm -f "backups/db/family_finance_${STAMP}.sql.gz"
  echo "Encrypted backup written to backups/db/family_finance_${STAMP}.sql.gz.enc"
else
  echo "Backup written to backups/db/family_finance_${STAMP}.sql.gz"
fi

echo "Backing up receipt attachments..."
docker run --rm -v family_finance_uploads:/data:ro -v "$(pwd)/backups:/backup" alpine:3.20 \
  tar -czf "/backup/uploads_${STAMP}.tar.gz" -C /data uploads

echo
echo "Restore procedure (tested on a copy first!):"
echo "  docker compose stop api web"
echo "  gunzip -c backups/db/family_finance_${STAMP}.sql.gz | \\"
echo "    docker compose exec -T db psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\""
echo "  docker compose start api web"
