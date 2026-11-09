#!/bin/sh
# Apply database migrations before starting the API. Migrations are idempotent,
# so restarting the container is always safe and never removes the data volume.
set -e

echo "[family-finance] Applying database migrations..."
alembic upgrade head

echo "[family-finance] Starting API on port 8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-2}" --proxy-headers
