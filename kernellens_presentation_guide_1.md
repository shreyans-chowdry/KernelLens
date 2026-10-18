# KernelLens — Presentation & Defense Guide
### For Shreyans Chowdry & Swapnil Jain — OS Lab (BCSE303P)

> **⚠️ Read this box first.** This guide uses **only the numbers in our actual
> submitted IEEE paper** (`KernelLens_IEEE_Paperr.docx`). An earlier internal
> notes file (`study.md`) contains some different, more inflated numbers
> (e.g. "F1 0.8667 precision 100% as a clean result," "70–85% context
> reduction," "domain adaptation 0.50→0.6667"). **Do not quote those in
> front of the teacher.** If she has read the paper — or asks you to defend
> any number — the paper is what will be checked against, and the paper is
> *deliberately* more conservative and caveated than that notes file. Every
> figure below matches the paper exactly, caveats included. Being precise
> and upfront about limitations is a strength in a viva, not a weakness —
> it's literally what Section X of our own paper does.

---

## 1. The 60-Second Pitch (say this first)

> "Linux systems produce huge volumes of kernel and system logs, but the
> handful of lines that actually explain an incident are buried in
> thousands of repetitive, benign messages. KernelLens is a multi-stage
> pipeline that parses logs into templates with Drain3, scores individual
> events for anomalousness with a trained Random Forest classifier, groups
> the flagged events into incidents using temporal and semantic
> correlation, and only then hands a small, structured, evidence-backed
> context to a root-cause-analysis stage — which must cite the exact log
> lines it used as evidence. We built this as a feasibility study, not a
> production claim, and we're upfront in our paper about exactly what our
> small-scale evaluation does and doesn't show."

---

## 2. The Problem, in Plain Language

- Three *different* questions get conflated in naive log monitoring:
  1. **Anomaly detection** — is this one event suspicious?
  2. **Incident correlation** — which suspicious events belong to the same incident?
  3. **Root-cause analysis** — what's the best explanation for the correlated evidence?
- A plain classifier only answers (1). Dumping raw logs into an LLM tries to
  answer all three at once, badly — it enlarges the prompt with irrelevant
  context and produces explanations that aren't tied to specific log lines.
- KernelLens keeps these three questions as **separate pipeline stages**,
  each answered by the right tool, with the LLM only invoked last, on an
  already-reduced, already-structured context.

---

## 3. Architecture — the Five-Stage Pipeline

```
[Linux Log Sources] → [Drain3 Parser] → [Random Forest Classifier] → [Semantic-Temporal Correlator]
  dmesg, journalctl,     Template mining,    Anomaly probability          TF-IDF cosine similarity +
  log files, synthetic   parameter masking   p(x) per event               60s temporal window + BFS
                                                                                    |
                                                                                    v
[Dashboard / API]  ←  [PostgreSQL]  ←  [RCA Engine (Gemini or local fallback)]  ←  [Context Construction]
  Incident cards          Persisted           Structured, schema-validated            Reduced diagnostic
  Evidence timeline       incidents/          output: cause + evidence +              context per incident
  Read-only commands      evidence            confidence + commands                   cluster
```

Three definitions to keep straight (the paper is explicit about this and an
evaluator may probe it):
- **Anomaly** = one suspicious log event, flagged by the classifier.
- **Incident** = a *group* of related anomalous events, produced by correlation.
- **Root cause** = the most plausible explanation inferred from an incident's evidence.

These stages are not interchangeable — don't blur them when explaining.

---

## 4. Stage-by-Stage Deep Dive

### 4.1 Log Collection & Drain3 Parsing
- Sources: `dmesg`, `journalctl`, local log files, and synthetic diagnostic
  scenarios (used for cross-platform demoing, e.g. on a non-Linux dev
  machine).
- Every log line → a structured event with timestamp, source, host,
  severity, message text, and a `log_event_id` (this ID is what evidence
  citations later point back to).
- **Drain3** mines templates from the message text, masking variable
  fields (IPs, hex addresses, device paths, PIDs, memory sizes,
  sector/block/inode numbers, UUIDs) so two OOM-kill messages that only
  differ in PID/size collapse to the same template.
- Honest caveat to know: the masking rules are **rule-based regex**, and
  we make no claim they cover every possible kernel message format.

### 4.2 ML Anomaly Detection (Random Forest)
**Features** (5 groups, concatenated into one vector):
| Group | What it is |
|---|---|
| Textual | 128 TF-IDF features over the Drain3 template string (unigrams + bigrams) |
| Frequency | Template occurrence count ÷ total events |
| Recurrence | log(1 + Δt) since this template last occurred, plus a novelty flag |
| Severity | Numeric weight, 0.0 (debug) → 4.0 (critical/emergency) |
| Structure | Number of parameters the parser extracted |

**Model:** Random Forest, 100 trees, max depth 12, `class_weight="balanced"`,
`random_state=42`, trained on a **curated 85-sample LogHub benchmark** (BGL,
HDFS, Linux subsets — see table below), deployed probability threshold
**0.65**.

| Subset | Total | Normal | Anomalous |
|---|---|---|---|
| BGL | 18 | 10 | 8 |
| HDFS | 20 | 12 | 8 |
| Linux | 47 | 18 | 29 |
| **LogHub total** | **85** | **40** | **45** |

**The headline result — and the catch you must explain proactively:**
- 80/20 split, `shuffle=False` (chronological) → 68 train / 17 test.
- Because the dataset is ordered with all normal samples before anomalous
  ones, **every one of the 17 test samples ends up anomalous.** Zero
  normal samples land in the test set.
- Result: **Accuracy 76.47%, Precision 100.00%, Recall 76.47%, F1 86.67%,
  ROC-AUC 1.00** (13 of 17 correctly detected).
- **Precision is 100% by mathematical construction** — with no negative
  samples in the test set, a false positive is literally impossible. This
  is *not* a claim of a flawless classifier. We report this explicitly as
  a **detection rate**, not general accuracy, and we say plainly that
  **false-positive behavior was never measured** in this evaluation.
- (Minor footnote if asked: the currently *stored* model artifact scores
  slightly lower — 64.71% accuracy/recall, F1 78.57%, 11/17 detections —
  a two-sample difference too small to draw conclusions from.)

### 4.3 Domain Adaptation (macOS feasibility experiment)
- 21 curated Darwin/macOS logs (11 normal, 10 anomalous — Jetsam kills,
  sandbox denials, a kernel panic).
- Stratified 50/50 split → 10 train, 11 hold-out.
- **Base model** (trained only on LogHub, zero-shot on macOS): Accuracy
  0.6364, Precision 1.0000, Recall 0.2000, **F1 0.3333**.
- **Domain-adapted model** (LogHub + 10 local samples, 5× oversampled):
  Accuracy 0.7273, Precision 0.6667, Recall 0.8000, **F1 0.7273**.
- **F1 improvement: +0.3939.**
- At this scale (5 anomalous hold-out samples), one sample swings recall
  by 0.20 — so frame this as "a few in-domain samples measurably changed
  behavior on Darwin-specific vocabulary (jetsam, launchd)," **not** as
  evidence of general cross-platform transferability.

### 4.4 Semantic-Temporal Event Correlation
- Purely algorithmic — **no separately trained model** here, unlike the
  classifier.
- Each flagged event → text representation (template + regex-extracted
  entities: devices, process names, services, PIDs, subsystem keywords) →
  TF-IDF vector (unigrams+bigrams, sublinear scaling).
- An edge connects two events when **both** hold: `|tᵢ − tⱼ| ≤ 60s` AND
  cosine similarity ≥ 0.08.
- Incident clusters = **connected components** of that graph, found via BFS.
- Because connectivity is transitive, two events can land in the same
  incident through a *chain* of intermediates even without being directly
  similar — this is intentional (captures causal chains like I/O error →
  filesystem error → blocked process → service failure) but means cluster
  quality is sensitive to the threshold, and **that sensitivity was not
  separately evaluated.**

### 4.5 Context Construction — Novelty Point 1
This is the core novelty: never feed raw/full logs to the LLM.

**What actually got measured (Table V — event-count reduction, not token
reduction):**
| Scenario | Raw events | Retained (anomalous) | Reduction |
|---|---|---|---|
| Mixed workload | 34 | 16 | **52.94%** |
| OOM killer cascade | 9 | 4 | 55.56% |
| Storage fault cascade | 8 | 8 | 0.00% |
| Segfault storm | 5 | 4 | 20.00% |
| Thermal throttling | 6 | 0 | 100.00% |

**Say this, not "70–85% reduction":** reduction is highly scenario-dependent
(0% to 100% across our five test scenarios), it's measured in *event count*
not prompt tokens, and a high ratio is only useful if the discarded events
were genuinely irrelevant — which this experiment didn't separately verify.

**The pipeline funnel for the 34-event mixed workload (Fig. 5), stage by
stage:**
1. 34 raw events
2. → 28 unique Drain3 templates *(a distinct-template count, not a filter — several events share templates)*
3. → 16 ML-retained anomalous events *(classifier threshold 0.50 was used specifically for this experiment, vs. 0.65 deployed — be ready for that question)*
4. → still 16 events, now organized into **2 incident clusters** *(correlation groups, it doesn't remove)*
5. → the diagnostic result for the primary cluster **cites 5 evidence events**

So the stages are **not a monotone filtering funnel** — only the classifier
stage actually removes events; correlation reorganizes, it doesn't shrink.

### 4.6 Root-Cause Analysis & Evidence Grounding
- Structured output schema (Pydantic-validated), 4 fields: `cause` (non-empty,
  ≥5 chars), `evidence` (list of `log_event_id` references into the supplied
  context), `confidence` (∈[0,1]), `troubleshooting_commands` (command text +
  rationale, strictly read-only — `dmesg`, `free -h`, etc. — never
  auto-executed).
- A validator **rejects any result with an empty evidence list.**
- **Two backends exist:** (a) live Google Gemini via API, and (b) a
  deterministic local reasoning fallback with no network dependency.
- **The honest, important part:** *all RCA results reported in the paper
  come from the local fallback* — no live Gemini API key was available in
  the benchmark environment, so the Gemini path is implemented and runs in
  our live demo, but it was **not exercised in any of our reported
  experiments.** Live Gemini latency and hallucination behavior are
  **unmeasured.**
- The schema guarantees *at least one event is cited* — it does **not**
  verify the stated cause is actually correct. Reducing hallucination
  through evidence-grounding is our **design objective**, not something we
  proved empirically.

---

## 5. Performance / Latency (Table VI)

Measured over 15 iterations, **local deterministic fallback**, 34-event batch:

| Stage | Latency (ms) |
|---|---|
| Drain3 parsing | 9.71 ± 2.29 |
| ML stage (features + Random Forest) | **881.23 ± 149.18** |
| Semantic correlation | 8.46 ± 1.16 |
| Context serialization | 0.32 ± 0.09 |
| Local deterministic RCA | 0.39 ± 0.11 |
| **Total** | **900.12 ± 149.49** |

The ML stage dominates (~98% of total time). **Say explicitly:** this is
offline/local-fallback latency; live Gemini latency was never benchmarked
and this number must not be used to estimate it.

---

## 6. How This Differs From Related Work (short version)

- **Drain / Drain3** (He et al., 2017) — we reuse Drain3 as our parser; we
  don't claim a new parsing algorithm.
- **DeepLog, LogAnomaly, LogRobust** — these model *sequences* of log
  events (LSTM/attention-based). We deliberately use a lighter-weight
  **per-event** Random Forest that doesn't model sequence order — a
  trade-off we discuss, not something we claim is strictly better.
- **LogCluster, Log3C** — correlate log *sequences* against a knowledge
  base or KPI data. We correlate individual *events* by time + semantic
  similarity via graph connected components, and we use no KPI data.
- **Ahmed et al. (Microsoft, GPT-3.x for incident RCA), LogPrompt** — apply
  LLMs more directly to raw/prompted logs. We constrain the LLM's input
  through upstream filtering + clustering and require evidence citations in
  a validated schema — **but whether this actually improves LLM output
  quality was not evaluated in this study.** Don't oversell this as proven.

---

## 7. Who Owns What — Speaker Handoff Script

*(Based on the current codebase split. Note: our Review 1 proposal listed
three members; the implementation and paper reflect the two of you —
mention this to your teacher only if asked.)*

**Shreyans — Ingestion, Parsing, ML Classification, Domain Adaptation**
- `collector.py`, `pollers.py` — dmesg/journalctl pollers
- `parser.py` — Drain3 template mining + regex masking
- `feature_extractor.py` — the 5-group feature pipeline
- `classifier.py`, `train_classifier.py` — Random Forest training on LogHub
- `domain_adaptation.py` — the macOS feasibility experiment

> *Say:* "I owned data ingestion and the ML anomaly-detection stage. Rather
> than brittle regex rules, I built a feature pipeline combining structural,
> frequency, temporal, and severity signals, trained a Random Forest on a
> curated LogHub benchmark with a strict chronological split, and ran a
> small domain-adaptation experiment on macOS logs — a proof of concept for
> cross-platform transfer, not a generalization claim."

**Swapnil — Correlation, Context Construction, LLM RCA, API**
- `event_correlation.py` — semantic-temporal graph clustering
- `schemas.py` — `ContextPayload` / Novelty Point 1
- `llm_analysis.py` — Gemini prompting, Pydantic guardrails, local fallback
- `main.py`, `incidents.py` — FastAPI endpoints, error envelope

> *Say:* "I owned everything downstream of anomaly detection: grouping
> flagged events into incidents via graph clustering, building the reduced
> context we pass to the reasoning stage, and enforcing evidence-grounding
> guardrails so the system can never return a root cause without citing
> specific log events. All troubleshooting commands are strictly read-only
> guidance — nothing in KernelLens executes a remediation automatically."

---

## 8. Live Terminal Demo Script

These are illustrative CLI demos from the running system — **note they use
a different, smaller synthetic scenario (`ext4_disk_corruption`, 8 events)
than the paper's formally reported 34-event mixed workload.** Both are real
system behavior, just different runs — don't present demo-script numbers as
if they were the paper's reported results, or vice versa.

**Step 1 — Init DB:**
```bash
python3 -c "import asyncio; from backend.app.core.database import init_db; asyncio.run(init_db()); print('✅ Database tables initialized successfully!')"
```

**Step 2 — Start backend:**
```bash
uvicorn backend.app.main:app --port 8000
# separate tab:
curl -s http://localhost:8000/health   # {"status":"healthy"}
```

**Step 3 — Live feature extraction + scoring on one real event:**
```bash
python3 -c "
from backend.app.pipeline.collector import ingest_log_event
from backend.app.pipeline.anomaly_filter import score_anomaly

event = ingest_log_event('[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB', source='dmesg')
score = score_anomaly(event)
print(f'Mined Template : {event.template_id}')
print(f'ML Score       : {score.score}')
print(f'Is Anomalous   : {score.is_anomalous}')
"
```

**Step 4 — Correlation on a synthetic scenario:**
```bash
python3 -c "
from backend.app.pipeline.collector import generate_synthetic_events
from backend.app.pipeline.anomaly_filter import filter_anomalies
from backend.app.pipeline.correlation import correlate_events

events = generate_synthetic_events('ext4_disk_corruption')
anomalies = filter_anomalies(events, threshold=0.65)
clusters = correlate_events([a[0] for a in anomalies], window_seconds=60.0, similarity_threshold=0.05)
print(f'Raw: {len(events)}  Anomalies: {len(anomalies)}  Clusters: {len(clusters)}  Events in Cluster 0: {clusters[0].event_count}')
"
```

**Step 5 — Full live scenario injection:**
```bash
python3 backend/run_live_presentation.py
```

**Step 6 — Query the generated incident:**
```bash
curl -s http://localhost:8000/api/v1/incidents | python3 -m json.tool | head -n 35
```

**Step 7 — Run the test suite:**
```bash
python3 -m pytest backend/tests -v
```

---

## 9. Viva / Cross-Examination Prep

**Q: Why Random Forest instead of a deep sequence model (LSTM/DeepLog-style)?**
A: Per-event scoring needs to be fast and interpretable; a Random Forest
gives sub-millisecond-per-event inference with no GPU requirement and
inspectable feature splits. Sequence models like DeepLog/LogAnomaly/LogRobust
model event *order*, which is a genuinely different and arguably stronger
signal — that's a real trade-off we made for a lighter-weight design, not a
claim that Random Forest is categorically better.

**Q: Your precision is 100% — doesn't that mean your classifier is flawless?**
A: No, and we say so explicitly in our paper. Because of the chronological
(unshuffled) 80/20 split, every one of the 17 test samples happened to be
anomalous — there were zero normal samples in the test set, so a false
positive was literally impossible. Precision is 100% *by construction*, not
because we validated zero false alarms on balanced data. We report this as a
detection rate (76.47% recall) rather than general accuracy, and we're
explicit that false-positive behavior was never measured in this evaluation.

**Q: Is an 85-sample / 21-sample dataset a serious benchmark?**
A: Honestly, no — we scope this explicitly as a small-scale feasibility
study, not a production-readiness claim. Both datasets are curated subsets
small enough that a single sample can shift recall by 0.20 in the domain
adaptation experiment. We say this directly in our Limitations section.

**Q: Did you compare against other log-anomaly systems (DeepLog, LogAnomaly, etc.)?**
A: No baseline comparisons were run — that's an explicitly stated limitation,
not an oversight we're hiding. We make no claim of superiority over prior
work.

**Q: Did you test with the live Gemini LLM, or is this all fallback logic?**
A: Both backends are implemented and the Gemini path runs in our live demo,
but every RCA result reported in the paper comes from the deterministic
local fallback — no live API key was available in our benchmark
environment. So live Gemini latency and hallucination behavior are
unmeasured; we don't claim otherwise.

**Q: How do you prevent LLM hallucination in root-cause output?**
A: Structurally: the context passed to the reasoning stage is already
filtered and correlated (never raw logs), and a Pydantic validator rejects
any result whose evidence list is empty — so a cause can never be returned
without citing at least one specific log event. That guarantees *citation*,
not *correctness* — we don't claim to have measured a reduction in actual
hallucination rate.

**Q: Why graph connected-components for correlation instead of simple time-windowing?**
A: Transitivity lets us capture causal *chains* — if event A links to B and
B links to C, all three land in one incident even if A and C aren't directly
similar. That's deliberate (e.g. I/O error → filesystem error → blocked
process → service failure), though it does mean cluster quality depends on
the similarity/time thresholds, and we didn't separately tune or ablate
those.

**Q: What's your actual measured context/event reduction — is it 70-85%?**
A: No — that's not what we report. On our main 34-event mixed workload we
measured a 52.94% event-count reduction; across five different test
scenarios the ratio ranged from 0% (storage fault cascade — everything was
retained) to 100% (thermal throttling — nothing was anomalous). It's highly
scenario-dependent and measured in event count, not prompt tokens.

**Q: Why are troubleshooting commands copy-only instead of auto-executed?**
A: Safety — automatically running a command during an active kernel-level
fault (e.g. filesystem corruption) risks making things worse or causing data
loss. The system is designed to give an operator grounded guidance, not to
act autonomously.

**Q: Did you measure statistical significance anywhere?**
A: No — we say this plainly in our Limitations section. At our dataset
sizes (17-sample and 11-sample hold-outs), individual samples move the
metrics too much to support significance testing in any meaningful way.

---

## 10. Limitations — Own These Confidently

Straight from our own paper (Section X) — say these proactively if asked
"what would you do differently" or "what's missing":
- Both benchmark datasets are small curated samples (85 LogHub, 21 macOS).
- The classifier hold-out is sequential and entirely anomalous by
  construction of the data ordering — false-positive behavior unmeasured.
- Live Gemini inference was never benchmarked; the deterministic fallback
  is not equivalent to a live external LLM.
- No large-scale/production fleet evaluation.
- No statistical significance testing.
- No baseline comparisons against competing log-anomaly systems.
- Event reduction is measured by count, not tokens.
- Correlation uses TF-IDF + graph clustering (not neural embeddings), and
  its parameters (60s window, 0.08 similarity threshold) weren't tuned or
  ablated.

---

## 11. Emergency Cheat Sheet

- **Database looks empty:** run `python3 backend/run_live_presentation.py`
  to re-seed a live scenario.
- **LLM API quota exceeded / no key:** explain the deterministic local
  fallback engine — this is in fact exactly what the paper's results use.
- **"Prove all tests pass":** `pytest backend/tests -v`
- **"Prove it's not hardcoded":** the model artifact
  (`anomaly_classifier.joblib`) is a real trained Random Forest + TF-IDF +
  StandardScaler; `dmesg -T` / `journalctl -k -o json` are real OS calls on
  a Linux machine; synthetic scenarios (for non-Linux dev machines) are
  realistic reproductions of real production log text, passed through the
  actual live parser/classifier/correlator/LLM — nothing in that path is
  mocked.

---

## 12. One-Page Numbers Cheat Sheet

| Metric | Value |
|---|---|
| LogHub benchmark size | 85 samples (40 normal / 45 anomalous) |
| Train/test split | 68 / 17 (chronological, unshuffled) |
| Classifier: Accuracy / Recall | 76.47% |
| Classifier: Precision | 100.00% *(trivial — test set has no normal samples)* |
| Classifier: F1 | 86.67% |
| macOS domain adaptation: Base F1 → Adapted F1 | 0.3333 → 0.7273 (+0.3939) |
| Event reduction, mixed workload (34→16) | 52.94% |
| Event reduction range across 5 scenarios | 0% – 100% |
| Evidence events cited (primary incident, mixed workload) | 5 |
| Correlation window / similarity threshold | 60s / cosine ≥ 0.08 |
| Deployed classifier threshold | p ≥ 0.65 |
| Total offline pipeline latency (local fallback) | 900.12 ± 149.49 ms |
| Live Gemini latency | **Not measured** |
