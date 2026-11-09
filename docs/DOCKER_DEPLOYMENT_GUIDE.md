# Docker Deployment Guide

How to run **Family Finance Manager** on a home computer / private network with Docker
Compose, and how to keep the data safe.

- Target: one household, one Linux/macOS/Windows host with Docker Engine 24+ and the
  Compose v2 plugin (`docker compose`, not the old `docker-compose`).
- No cloud service, no paid dependency, no internet access needed at runtime.

---

## 1. What gets deployed

| Service | Container | Image | Published port | Notes |
| --- | --- | --- | --- | --- |
| `web` | `family-finance-web` | built from `frontend/Dockerfile` (nginx) | **8080 → 80** | serves the React SPA and proxies `/api` to `api:8000` |
| `api` | `family-finance-api` | built from `backend/Dockerfile` (Python 3.11 slim) | **8000 → 8000** | runs `alembic upgrade head`, then uvicorn (2 workers) |
| `db` | `family-finance-db` | `postgres:16-alpine` | **none** | internal Docker network only |
| `backup` | `family-finance-backup` | built from `backups/Dockerfile` | none | `pg_dump` loop + weekly receipts archive |

Persistent volumes:

| Volume | Mounted at | Contents |
| --- | --- | --- |
| `family_finance_pgdata` | `db:/var/lib/postgresql/data` | the database (never delete) |
| `family_finance_uploads` | `api:/data/uploads`, `backup:/data/uploads` (read-only) | receipt attachments |
| `./backups` (bind mount) | `backup:/backups` | dump files, visible from the host |

Networks: `internal` (db, api, backup) and `web` (api, web). Only `api` and `web` publish
ports; PostgreSQL cannot be reached from the LAN.

```
LAN browser ──8080──▶ web (nginx) ──/api──▶ api (FastAPI) ──5432──▶ db
                                              ▲                     ▲
                                              8000 (docs, admin)   │
                                              backup ──pg_dump──────┘
```

> **Sandbox note:** the environment used to build this project had no Docker daemon, so
> the stack was validated by review (Dockerfiles, health checks, volume/network wiring and
> environment variables). Section 9 lists the smoke test to run once on the real host.

---

## 2. Prerequisites

1. Docker Engine + Compose v2:
   ```bash
   docker --version && docker compose version
   ```
2. A host on the home network with a **reserved LAN IP** (set it in the router, e.g.
   `192.168.1.50`) so bookmarks keep working.
3. ~1 GB disk for images plus space for `backups/` (a dump of this application is a few
   hundred KB per household-year; plan 1–2 GB).
4. Ports **8080** and **8000** free on the host. Change them with `FRONTEND_PORT` /
   `BACKEND_PORT` if they clash.

## 3. First deployment

```bash
git clone <repository-url> family-finance
cd family-finance

cp .env.example .env
# Generate real secrets (do not reuse the placeholders):
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # → SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(24))"   # → POSTGRES_PASSWORD
```

Edit `.env`:

```dotenv
SECRET_KEY=<the 48-byte value>
POSTGRES_PASSWORD=<the 24-byte value>
# DATABASE_URL must repeat the same password because it is embedded in the URL:
DATABASE_URL=postgresql+psycopg2://family_finance:<the 24-byte value>@db:5432/family_finance
BACKEND_CORS_ORIGINS=http://192.168.1.50:8080
FRONTEND_PORT=8080
BACKEND_PORT=8000
BACKUP_RETENTION_DAYS=30
BACKUP_INTERVAL_SECONDS=86400
UVICORN_WORKERS=2
```

Start everything (first run builds the images):

```bash
docker compose up -d --build
docker compose ps                 # all services should be "running"/"healthy"
docker compose logs -f api        # watch "Applying database migrations..." then uvicorn
```

Open:

- Application: `http://192.168.1.50:8080`
- API documentation: `http://192.168.1.50:8000/api/docs`
- Health check: `http://192.168.1.50:8000/health`

### Create the administrator

The first visit to the app shows **Household setup** (`/setup`):

1. Enter the household name and the administrator's name, email and password.
2. Submit — this creates the household **and** the first user as `admin`.
3. `POST /api/v1/auth/setup` then returns `409 Conflict` forever: public registration is
   disabled. Further members are created by the administrator in **Members**.

### Restart behaviour

All services use `restart: unless-stopped`, so after a host reboot the stack comes back
automatically as long as Docker itself starts on boot (`sudo systemctl enable docker`).

## 4. Day-to-day commands

| Task | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Stop (keeps data) | `docker compose down` |
| Rebuild after `git pull` | `docker compose up -d --build` |
| Status / health | `docker compose ps` |
| Follow logs | `docker compose logs -f api` / `-f web` / `-f backup` |
| API shell | `docker compose exec api sh` |
| psql shell | `docker compose exec db psql -U family_finance -d family_finance` |
| On-demand backup | `./backups/backup.sh` |
| Apply migrations manually | `docker compose exec api alembic upgrade head` |
| Recreate one service | `docker compose up -d --build api` |

**Never run `docker compose down -v`** on this project: `-v` deletes the named volumes and
with them the database. Routine updates never need it.

## 5. Backups

Two mechanisms, both writing into `./backups/` on the host:

1. **`backup` service** (automatic). Every `BACKUP_INTERVAL_SECONDS` (default 86400 = daily)
   it runs `pg_dump | gzip` into `backups/db/family_finance_<timestamp>.sql.gz`. Every 7th
   loop it also archives the receipts volume to `backups/uploads_<timestamp>.tar.gz`.
   Files older than `BACKUP_RETENTION_DAYS` (default 30) are pruned.
2. **`backups/backup.sh`** (manual, before risky changes):
   ```bash
   ./backups/backup.sh
   ls -lh backups/db | tail -3
   ```

### Encryption at rest

Set `BACKUP_ENCRYPTION_PASSPHRASE` in `.env` and each dump is encrypted with
`openssl enc -aes-256-cbc -salt -pbkdf2`. The plain `.sql.gz` is deleted afterwards, leaving
`family_finance_<timestamp>.sql.gz.enc`. Store the passphrase **outside** the host (password
manager); without it the backups cannot be restored.

### Off-host copy (blueprint: weekly full copy to another drive)

```bash
rsync -av --delete ./backups/ /mnt/usb-drive/family-finance-backups/
```

Add it to the host crontab for a weekly run, e.g. `0 3 * * 1 /home/me/family-finance/backups/copy-off-host.sh`.
Receipt attachments are already included through `uploads_*.tar.gz`.

### Restore procedure

Test this on a scratch copy before you need it.

```bash
# 1. Stop the application (leave the database running)
docker compose stop api web

# 2. Pick the dump you want
ls -lh backups/db

# 3a. Unencrypted dump
gunzip -c backups/db/family_finance_20261109_030000.sql.gz \
  | docker compose exec -T db psql -U family_finance -d family_finance

# 3b. Encrypted dump (prompts for the passphrase)
openssl enc -d -aes-256-cbc -pbkdf2 -in backups/db/family_finance_20261109_030000.sql.gz.enc \
  | gunzip -c \
  | docker compose exec -T db psql -U family_finance -d family_finance

# 4. Restore receipts, if needed
docker run --rm -v family_finance_uploads:/data -v "$PWD/backups:/backup" alpine:3.20 \
  tar -xzf /backup/uploads_20261109_030000.tar.gz -C /data

# 5. Start again
docker compose start api web
```

If the database volume itself is gone, create an empty database first
(`docker compose up -d db`, wait for healthy), then run step 3.

Full runbook with verification queries: [`backups/README.md`](../backups/README.md).

## 6. Configuration reference

All values come from `.env` (see `.env.example`). Restart the affected container after a
change: `docker compose up -d api`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | — (required) | JWT signing key, at least 32 chars |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | access-token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | refresh-token lifetime |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `family_finance` / `family_finance` / — (required) | database credentials |
| `DATABASE_URL` | — | full SQLAlchemy URL; keep the password in sync |
| `BACKEND_CORS_ORIGINS` | `http://localhost:8080` | comma-separated allowed origins |
| `UPLOAD_DIR` | `/data/uploads` | receipt storage inside the API container |
| `MAX_UPLOAD_MB` | `10` | receipt size limit (nginx allows 12 MB) |
| `FRONTEND_PORT` / `BACKEND_PORT` | `8080` / `8000` | published host ports |
| `UVICORN_WORKERS` | `2` | API worker processes |
| `BACKUP_RETENTION_DAYS` | `30` | dump retention |
| `BACKUP_INTERVAL_SECONDS` | `86400` | dump cadence |
| `BACKUP_ENCRYPTION_PASSPHRASE` | empty | enables encrypted dumps |

Household-level preferences (currency symbol, budget thresholds, notification toggles) are
stored in the database and edited in **Settings**; they are not environment variables.

## 7. Security checklist

- [ ] `.env` exists only on the host, permissions `600`, and is git-ignored.
- [ ] `SECRET_KEY` and `POSTGRES_PASSWORD` are random, not the sample values.
- [ ] `docker compose ps` shows no published port for `db`.
- [ ] `http://<host-ip>:5432` is **not** reachable from another machine.
- [ ] `BACKEND_CORS_ORIGINS` lists only the real LAN origin.
- [ ] Administrator password is unique; members are created by the admin, not by sign-up.
- [ ] Backups land in `./backups`, are encrypted if they leave the host, and the passphrase
      is stored separately.
- [ ] The host firewall allows 8080/8000 only from the home network.
- [ ] For remote access use a VPN (e.g. Tailscale). **Do not** port-forward this stack to
      the public internet.

## 8. Updating to a new version

```bash
./backups/backup.sh              # 1. fresh backup
git pull                         # 2. new code
docker compose up -d --build     # 3. rebuild + restart; entrypoint runs alembic upgrade head
docker compose logs -f api       # 4. confirm migrations and "Application startup complete"
```

Rollback: `git checkout <previous-tag> && docker compose up -d --build`. If a migration has
no downgrade path, restore the dump taken in step 1.

## 9. Post-deployment smoke test

Run once after the first `docker compose up`, and after every update:

```bash
BASE=http://192.168.1.50
curl -fsS $BASE:8000/health                      # {"status":"ok","version":"1.0.0"}
curl -fsS -o /dev/null -w "%{http_code}\n" $BASE:8080/          # 200, SPA shell
curl -fsS -o /dev/null -w "%{http_code}\n" $BASE:8000/api/docs  # 200, Swagger UI

# Login through nginx (proves the /api proxy works end-to-end)
curl -fsS -X POST $BASE:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin-email>","password":"<admin-password>"}' | head -c 120
```

Then in the browser, sign in and check: dashboard loads, a budget shows a utilisation bar,
**Reports → Excel** downloads a file, **Notifications** shows an unread badge, and the
**Audit** page lists the login event.

```bash
docker compose logs backup | tail -5    # "[backup] Dumping database to ..."
ls -lh backups/db | tail -3             # a dump exists
```

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `POSTGRES_PASSWORD` or `SECRET_KEY` "is required" on `up` | `.env` missing or variable empty — recreate it from `.env.example` |
| API exits with `could not translate host name "db"` | db container not healthy yet; `docker compose logs db`, wait and `docker compose up -d` |
| Browser shows the app but every request 502s | `api` container down — `docker compose logs api`; usually a migration error |
| `address already in use` on start | port clash on the host; change `FRONTEND_PORT` / `BACKEND_PORT` |
| CORS error in the console | `BACKEND_CORS_ORIGINS` must contain the exact origin you browse to (scheme + host + port) |
| Login fails right after restore | restored dump is older than your `.env` secrets; tokens are re-issued on login, so simply log in again |
| `backups/db/*.sql.gz` is 0 bytes | `pg_dump` failed (wrong `PGPASSWORD`); see `docker compose logs backup` |
| Uploads rejected | file over `MAX_UPLOAD_MB`, or the type is not `pdf/png/jpg/jpeg/webp` |
| Data "disappeared" after an update | a volume was recreated (e.g. `down -v`); restore the latest dump |

## 11. Directory reference

```
docker-compose.yml              # the four services, volumes, networks
.env.example                    # copy to .env and fill in
backend/Dockerfile              # FastAPI image, non-root user, healthcheck
backend/docker-entrypoint.sh    # alembic upgrade head → uvicorn
frontend/Dockerfile             # node build → nginx runtime
frontend/nginx.conf             # SPA fallback, /api proxy, gzip, security headers
backups/Dockerfile              # postgres:16-alpine + openssl for the backup loop
backups/backup-loop.sh          # daily dump, weekly receipts, retention pruning
backups/backup.sh               # on-demand backup + printed restore hint
database/init/01-database-settings.sql  # first-boot settings, metadata table
```
