"""Family Finance Manager API entry point.

A private, self-hosted family finance application. See docs/ for the
functional requirements, database design, RBAC matrix and deployment guide.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("family_finance")

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "Private family budget and expense management API. Shared and personal "
        "finances, budgets, recurring payments, savings goals, loans, reports and audit history."
    ),
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://[a-z0-9-]+\.e2b\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):  # pragma: no cover
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An unexpected error occurred"})


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "app": settings.app_name, "version": "1.0.0"}


@app.get("/api/v1/health", tags=["System"])
def api_health():
    return {"status": "ok", "environment": settings.environment}


app.include_router(api_router, prefix=settings.api_prefix)


@app.on_event("startup")
def on_startup() -> None:
    """Development convenience only.

    Production deployments run `alembic upgrade head` (docker-compose does this
    automatically) so the schema is always migration-managed.
    """
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    if not settings.is_postgres:
        from app.core.database import Base, engine
        import app.models  # noqa: F401  (register all models)

        Base.metadata.create_all(bind=engine)
        logger.warning(
            "Running on SQLite development fallback (%s). Use PostgreSQL in production.",
            settings.database_url,
        )
