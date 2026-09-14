import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_api_root_and_health(async_client: AsyncClient):
    res_root = await async_client.get("/")
    assert res_root.status_code == 200
    data_root = res_root.json()
    assert data_root["status"] == "operational"
    assert len(data_root["pipeline_stages"]) == 11

    res_health = await async_client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_post_events_happy_and_failure(async_client: AsyncClient):
    # Happy path: Ingest a parsed LogEvent
    payload = {
        "source": "dmesg",
        "raw_text": "[ 1042.883921] blk_update_request: I/O error, dev sda, sector 2048",
        "host": "worker-01",
        "template_id": "TMPL_blk_io_error",
        "parsed_fields": {"subsystem": "storage", "sector": 2048},
    }
    res = await async_client.post("/events", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["source"] == "dmesg"
    assert "blk_update_request" in data["raw_text"]
    assert "id" in data

    # Also test via /api/v1 prefix
    res_v1 = await async_client.post("/api/v1/events", json=payload)
    assert res_v1.status_code == 201

    # Failure case: empty raw_text returns standard error envelope
    bad_payload = {
        "source": "dmesg",
        "raw_text": "   ",
        "host": "worker-01",
    }
    res_err = await async_client.post("/events", json=bad_payload)
    assert res_err.status_code == 400
    err_body = res_err.json()
    assert "error" in err_body
    assert err_body["error"]["code"] == "EMPTY_RAW_TEXT"
    assert "cannot be empty" in err_body["error"]["message"]


@pytest.mark.asyncio
async def test_incidents_crud_happy_and_failure(async_client: AsyncClient):
    # 1. Ingest two log events first
    ev1_res = await async_client.post("/events", json={
        "source": "dmesg",
        "raw_text": "[ 1042.883921] blk_update_request: I/O error, dev sda",
        "host": "node-1",
    })
    ev2_res = await async_client.post("/events", json={
        "source": "dmesg",
        "raw_text": "[ 1043.109823] EXT4-fs error (device sda1): ext4_lookup: deleted inode",
        "host": "node-1",
    })
    ev1_id = ev1_res.json()["id"]
    ev2_id = ev2_res.json()["id"]

    # 2. POST /incidents: Create incident
    inc_payload = {
        "status": "active",
        "confidence": 0.0,
        "correlated_event_ids": [ev1_id, ev2_id],
    }
    res_create = await async_client.post("/incidents", json=inc_payload)
    assert res_create.status_code == 201
    inc_data = res_create.json()
    inc_id = inc_data["id"]
    assert inc_data["status"] == "active"
    assert len(inc_data["correlated_event_ids"]) == 2

    # 3. GET /incidents: List incidents
    res_list = await async_client.get("/incidents")
    assert res_list.status_code == 200
    items = res_list.json()
    assert len(items) >= 1
    assert any(i["id"] == inc_id for i in items)

    # 4. GET /incidents/{id}: Incident detail
    res_detail = await async_client.get(f"/incidents/{inc_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["id"] == inc_id
    assert len(detail["events"]) == 2

    # 4b. GET /incidents/{id} Failure case: non-existent incident
    res_404 = await async_client.get("/incidents/non-existent-uuid-1234")
    assert res_404.status_code == 404
    err_body = res_404.json()
    assert "error" in err_body
    assert err_body["error"]["code"] == "INCIDENT_NOT_FOUND"


@pytest.mark.asyncio
async def test_incidents_analyze_and_troubleshooting(async_client: AsyncClient):
    # Ingest event and create incident
    ev_res = await async_client.post("/events", json={
        "source": "dmesg",
        "raw_text": "[ 1042.883921] blk_update_request: I/O error, dev sda",
    })
    ev_id = ev_res.json()["id"]

    inc_res = await async_client.post("/incidents", json={
        "status": "active",
        "correlated_event_ids": [ev_id],
    })
    inc_id = inc_res.json()["id"]

    # POST /incidents/{id}/analyze - Happy Path
    res_analyze = await async_client.post(f"/incidents/{inc_id}/analyze")
    assert res_analyze.status_code == 200
    analyzed = res_analyze.json()
    assert analyzed["root_cause_summary"] is not None
    assert analyzed["confidence"] > 0.0
    assert len(analyzed["evidence_list"]) >= 1
    assert len(analyzed["troubleshooting_suggestions"]) >= 1

    # Check evidence citations
    assert any(e["log_event_id"] == ev_id for e in analyzed["evidence_list"])

    # GET /incidents/{id}/troubleshooting - Happy Path
    res_tb = await async_client.get(f"/incidents/{inc_id}/troubleshooting")
    assert res_tb.status_code == 200
    commands = res_tb.json()
    assert len(commands) >= 1
    assert "command_text" in commands[0]
    assert "rationale" in commands[0]

    # POST /incidents/{id}/analyze Failure Case 1: Empty incident
    empty_inc_res = await async_client.post("/incidents", json={"status": "active", "correlated_event_ids": []})
    empty_inc_id = empty_inc_res.json()["id"]
    res_empty_err = await async_client.post(f"/incidents/{empty_inc_id}/analyze")
    assert res_empty_err.status_code == 400
    assert res_empty_err.json()["error"]["code"] == "EMPTY_INCIDENT"

    # POST /incidents/{id}/analyze Failure Case 2: 404 non-existent
    res_not_found = await async_client.post("/incidents/non-existent-id/analyze")
    assert res_not_found.status_code == 404
    assert res_not_found.json()["error"]["code"] == "INCIDENT_NOT_FOUND"

    # GET /incidents/{id}/troubleshooting Failure Case: 404 non-existent
    res_tb_404 = await async_client.get("/incidents/non-existent-id/troubleshooting")
    assert res_tb_404.status_code == 404
    assert res_tb_404.json()["error"]["code"] == "INCIDENT_NOT_FOUND"
