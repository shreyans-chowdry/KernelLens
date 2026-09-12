# KernelLens AI — Backend & LLM Integration (Part [B])

Implementation of **Part [B]** for the Operating Systems Lab (BCSE303P) Review 1 Report:
*"LLM-Driven Dynamic Kernel Log Root Cause Analyzer"*.

---

## 1. Responsibilities (Part [B])
- **FastAPI Service**: Endpoints for event ingestion, incident listing/detail, LLM root cause analysis trigger, and troubleshooting guidance.
- **Pydantic Schemas**: Strict type validation and standard error envelope (`{"error": {"code", "message", "details"}}`).
- **Context Construction (Novelty Point 1)**: Isolates and reduces candidate incident logs to pass strictly needed context to the LLM (never raw full streams).
- **Structured LLM Root Cause Analysis**:
  - Requires structured JSON `{cause, evidence: [...], confidence, troubleshooting_commands: [...]}`.
  - Automatic 1-retry with schema feedback on invalid JSON.
  - Hardened Pydantic validator rejecting any cause with 0 cited `log_event_ids`.
  - Confidence constrained to $[0.0, 1.0]$.
  - Copy-only troubleshooting commands with safety rationale (no automated execution).

---

## 2. Project Layout (Part [B])

```
backend/
├── app/
│   ├── api/
│   │   ├── events.py             # POST /events (ingest), GET /events (list)
│   │   └── incidents.py          # GET/POST /incidents, GET /incidents/{id},
│   │                             # POST /incidents/{id}/analyze, GET /incidents/{id}/troubleshooting
│   ├── core/
│   │   ├── config.py             # App settings & environment variables
│   │   └── database.py           # Async engine, sessionmaker & Base
│   ├── models/
│   │   ├── entities.py           # SQLAlchemy models (LogEvent, Incident, Evidence, Suggestions)
│   │   └── schemas.py            # Pydantic schemas (RootCauseAnalysisResult, IncidentRead, etc.)
│   ├── pipeline/
│   │   ├── anomaly_filter.py     # ML anomaly classifier
│   │   ├── collector.py          # Log ingestion and synthetic generator
│   │   ├── correlation.py        # Temporal/event correlation
│   │   ├── llm_analysis.py       # LLM Root-Cause Analysis stage with 1 retry & Pydantic validation
│   │   ├── parser.py             # Drain3 template miner & normalizer
│   │   └── persistence.py        # Log event persistence
│   └── main.py                   # FastAPI app with CORS & standard error envelope handlers
├── tests/
│   ├── conftest.py               # Shared async SQLite test engine fixtures
│   ├── test_api.py               # Happy path & failure tests for all 5 endpoints
│   ├── test_llm_analysis.py      # Pydantic validation, retry, & evidence tests
│   └── ...                       # Pipeline & ML unit tests
├── domain_adaptation_report.md   # Section 3.3 slide deck metrics
├── requirements.txt
└── .gitignore
```

---

## 3. Quickstart

### Install Dependencies:
```bash
python -m pip install -r requirements.txt
```

### Run Automated Pytest Suite:
```bash
python -m pytest tests -v
```
*(All 11 tests will execute covering happy paths, failure error envelopes, and Pydantic validation rules.)*

### Start Backend Server:
```bash
python run.py
```
- **Swagger UI**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **Health Check**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## 4. Part [A] Integration Guide (For Shreyans)

When Shreyans integrates the Part [A] Data & ML pipeline:
1. **Log Ingestion**: Part [A] log collection/parser emits parsed log records to:
   ```http
   POST /api/v1/events
   Content-Type: application/json

   {
     "raw_text": "kernel: [ 1042.883921] blk_update_request: I/O error, dev sda",
     "source": "dmesg",
     "template_id": "TMPL_io_error",
     "parsed_fields": {"dev": "sda"},
     "host": "linux-node-01"
   }
   ```
2. **Incident Creation**: Part [A] event correlator posts clustered event IDs to:
   ```http
   POST /api/v1/incidents
   Content-Type: application/json

   {
     "status": "active",
     "correlated_event_ids": ["<event_id_1>", "<event_id_2>"]
   }
   ```
3. **Trigger Analysis**: Part [A] or UI calls:
   ```http
   POST /api/v1/incidents/<incident_id>/analyze
   ```
