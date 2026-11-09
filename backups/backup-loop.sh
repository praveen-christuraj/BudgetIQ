#!/bin/sh
# Runs inside the `backup` container. Dumps PostgreSQL on an interval, archives
# receipts weekly and prunes old files using BACKUP_RETENTION_DAYS.
set -eu

RETENTION="${BACKUP_RETENTION_DAYS:-30}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
mkdir -p /backups/db /backups/uploads
DAY_COUNTER=0

echo "[backup] Starting daily database backup loop (retention ${RETENTION} days)"

while true; do
  STAMP="$(date +%Y%m%d_%H%M%S)"
  DUMP="/backups/db/family_finance_${STAMP}.sql.gz"

  echo "[backup] Dumping database to ${DUMP}"
  if pg_dump --no-owner --no-privileges | gzip -9 > "${DUMP}.tmp"; then
    mv "${DUMP}.tmp" "${DUMP}"
    if [ -n "${PASSPHRASE}" ]; then
      if command -v openssl >/dev/null 2>&1; then
        openssl enc -aes-256-cbc -salt -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
          -in "${DUMP}" -out "${DUMP}.enc" && rm -f "${DUMP}"
        echo "[backup] Encrypted dump written to ${DUMP}.enc"
      else
        echo "[backup] WARNING: openssl unavailable, dump left unencrypted"
      fi
    fi
  else
    echo "[backup] ERROR: pg_dump failed" >&2
    rm -f "${DUMP}.tmp"
  fi

  # Weekly archive of receipt attachments (every 7th loop iteration).
  DAY_COUNTER=$((DAY_COUNTER + 1))
  if [ $((DAY_COUNTER % 7)) -eq 0 ]; then
    TAR="/backups/uploads_${STAMP}.tar.gz"
    echo "[backup] Archiving receipts to ${TAR}"
    tar -czf "${TAR}" -C /data uploads 2>/dev/null || echo "[backup] WARNING: uploads volume not mounted"
  fi

  echo "[backup] Pruning files older than ${RETENTION} days"
  find /backups -type f -mtime "+${RETENTION}" -name '*.gz' -delete 2>/dev/null || true
  find /backups -type f -mtime "+${RETENTION}" -name '*.enc' -delete 2>/dev/null || true

  echo "[backup] Sleeping ${INTERVAL}s"
  sleep "${INTERVAL}"
done
