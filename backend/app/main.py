from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.app.api import events, incidents
from backend.app.core.config import settings
from backend.app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    await init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Intelligent Linux Kernel Log Diagnostics & Automated Root Cause Analysis Platform",
    lifespan=lifespan,
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================================
# Standard Error Envelope Exception Handlers
# Format: {"error": {"code": "...", "message": "...", "details": {...}}}
# =========================================================================
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    code = f"HTTP_{exc.status_code}"
    message = str(exc.detail)
    details = {}

    if isinstance(exc.detail, dict):
        code = exc.detail.get("code", code)
        message = exc.detail.get("message", message)
        details = exc.detail.get("details", {})

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details,
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": {"errors": exc.errors()},
            }
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc),
                "details": {},
            }
        },
    )


# =========================================================================
# Route Registration
# Mount at root (/events, /incidents) and API prefix (/api/v1/events, /api/v1/incidents)
# =========================================================================
app.include_router(events.router)
app.include_router(incidents.router)
app.include_router(events.router, prefix=settings.API_V1_STR)
app.include_router(incidents.router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "status": "operational",
        "version": "1.0.0",
        "pipeline_stages": [
            "Linux Log Sources",
            "Log Collection",
            "Log Parsing",
            "Anomaly Filtering (ML)",
            "Temporal/Event Correlation (ML)",
            "Context Construction",
            "LLM Root-Cause Analysis",
            "Cause + Evidence + Confidence",
            "Troubleshooting Guidance",
            "Database",
            "Interactive Dashboard",
        ],
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
