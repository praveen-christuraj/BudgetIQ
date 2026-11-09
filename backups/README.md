# Backups

Financial records are irreplaceable — treat backups as a core feature.

| Item | Where |
| --- | --- |
| PostgreSQL dumps | `backups/db/family_finance_<timestamp>.sql.gz` (or `.enc` when encrypted) |
| Receipt attachments | `backups/uploads_<timestamp>.tar.gz` |
| Database volume | Docker volume `family_finance_pgdata` — **never delete it** during updates |
| Uploads volume | Docker volume `family_finance_uploads` |

## Automatic backups

The `backup` service in `docker-compose.yml` runs `backup-loop.sh`:

* daily `pg_dump` (gzip, optional AES-256 encryption via `BACKUP_ENCRYPTION_PASSPHRASE`);
* weekly archive of receipt attachments;
* automatic pruning after `BACKUP_RETENTION_DAYS` (default 30).

Copies live in `./backups` on the host. Copy that folder to a second physical
drive weekly (3-2-1 rule).

## Manual backup

```bash
./backups/backup.sh
```

## Restore (tested procedure)

1. Stop the application containers:

   ```bash
   docker compose stop api web
   ```

2. Restore the database (existing objects are replaced - verify the file first):

   ```bash
   gunzip -c backups/db/family_finance_20260101_020000.sql.gz \
     | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
   ```

3. Restore attachments if needed:

   ```bash
   docker run --rm -v family_finance_uploads:/data -v "$PWD/backups:/backup" alpine:3.20 \
     tar -xzf /backup/uploads_20260101_020000.tar.gz -C /data
   ```

4. Start the application and sign in:

   ```bash
   docker compose start api web
   ```

5. Run a restoration test every quarter on a separate machine or a temporary
   Docker project. A backup that has never been restored is not a backup.
