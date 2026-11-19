from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
from app.core.limits import limiter
from app.routers import foods, meals, profile, scan

settings = get_settings()

app = FastAPI(
    title="Saige Fit API",
    version="0.1.0",
    docs_url=None if settings.is_prod else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_prod else "/openapi.json",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    # never leak internals to clients
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.get("/healthz")
def healthz():
    return {"status": "ok", "env": settings.environment}


for r in (profile, foods, meals, scan):
    app.include_router(r.router)
