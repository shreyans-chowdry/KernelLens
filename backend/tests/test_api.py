import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from backend.app.main import app


@pytest.mark.asyncio
async def test_api_root_and_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res_root = await client.get("/")
        assert res_root.status_code == 200
        data_root = res_root.json()
        assert data_root["status"] == "operational"
        assert len(data_root["pipeline_stages"]) == 11

        res_health = await client.get("/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "healthy"
