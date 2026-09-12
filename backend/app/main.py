from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.database import init_db
from backend.app.api.routes_logs import router as logs_router
from backend.app.api.routes_incidents import router as incidents_router
from backend.app.api.routes_analytics import router as analytics_router
from backend.app.api.routes_demo import router as demo_router


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

# Register API routers under /api/v1
app.include_router(logs_router, prefix=settings.API_V1_STR)
app.include_router(incidents_router, prefix=settings.API_V1_STR)
app.include_router(analytics_router, prefix=settings.API_V1_STR)
app.include_router(demo_router, prefix=settings.API_V1_STR)


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
            "Interactive Dashboard"
        ]
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
