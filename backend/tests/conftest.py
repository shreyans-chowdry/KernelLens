import os
import pathlib
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

# Configure database URL before importing database module
TEST_DB_PATH = pathlib.Path(__file__).parent.parent / "test_kernellens.db"
TEST_DB_URL = f"sqlite+aiosqlite:///{TEST_DB_PATH.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DB_URL

from backend.app.core.database import Base, engine, AsyncSessionLocal, get_db, init_db
import backend.app.models.entities  # noqa: F401 - ensure all tables are registered
from backend.app.main import app


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database():
    # Initialize database tables once for the test session
    await init_db()
    yield
    # Teardown: drop tables and remove test db file
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def async_client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()
