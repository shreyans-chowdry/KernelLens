"""
Reproduces every number reported in the KernelLens paper from the current code.

    python -m backend.benchmarks.paper_benchmarks            # offline results
    python -m backend.benchmarks.paper_benchmarks --gemini   # also live Gemini RCA

Writes backend/benchmarks/results.json. No database is needed; everything runs
in memory on the production code path (parser -> stored classifier -> correlator
-> RCA engine) with the deployed threshold theta = 0.65.
"""
import argparse
import asyncio
import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone

import numpy as np
import sklearn
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, train_test_split

from backend.app.core.config import settings
from backend.app.ml.classifier import AnomalyClassifierPipeline, DEFAULT_MODEL_PATH
from backend.app.ml.domain_adaptation import prepare_local_samples
from backend.app.ml.train_classifier import prepare_training_samples
from backend.app.models.schemas import ContextPayload, IncidentEventSummary
from backend.app.pipeline.anomaly_filter import score_anomaly
from backend.app.pipeline.collector import SYNTHETIC_SCENARIOS, ingest_log_event
from backend.app.pipeline.correlation import correlate_events
from backend.app.pipeline.llm_analysis import LLMRootCauseAnalyzer

THETA = settings.ANOMALY_THRESHOLD
OUT = os.path.join(os.path.dirname(__file__), "results.json")
SCENARIOS = ["ext4_disk_corruption", "oom_killer", "segfault_storm", "thermal_throttling"]


def metrics(y, pred, prob=None):
    m = {
        "n": len(y),
        "positives": int(sum(y)),
        "accuracy": accuracy_score(y, pred),
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "detected": int(sum(1 for a, b in zip(y, pred) if a == 1 and b == 1)),
        "false_positives": int(sum(1 for a, b in zip(y, pred) if a == 0 and b == 1)),
    }
    m["roc_auc"] = roc_auc_score(y, prob) if prob is not None and len(set(y)) > 1 else None
    return m


def eval_pipeline(pipe, events, labels, threshold=0.5):
    X = pipe.feature_extractor.transform(events, update_state=False)
    prob = pipe.model.predict_proba(X)[:, 1]
    pred = [int(p >= threshold) for p in prob]
    return metrics(labels, pred, prob)


def classifier_experiments():
    events, labels = prepare_training_samples()
    tr_e, te_e, tr_y, te_y = train_test_split(events, labels, test_size=0.20, shuffle=False)
    fresh = AnomalyClassifierPipeline()
    fresh.train(tr_e, tr_y)
    stored = AnomalyClassifierPipeline.load(DEFAULT_MODEL_PATH)
    res = {
        "sequential_holdout_fresh": eval_pipeline(fresh, te_e, te_y),
        "sequential_holdout_stored_artifact": eval_pipeline(stored, te_e, te_y),
        "sequential_holdout_fresh_theta065": eval_pipeline(fresh, te_e, te_y, THETA),
    }
    # Balanced protocol: repeated stratified 5-fold CV (5 repeats x 5 folds)
    y = np.array(labels)
    folds = []
    for seed in range(5):
        for tr, te in StratifiedKFold(5, shuffle=True, random_state=seed).split(events, y):
            p = AnomalyClassifierPipeline()
            p.train([events[i] for i in tr], list(y[tr]))
            folds.append(eval_pipeline(p, [events[i] for i in te], list(y[te])))
    keys = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    res["stratified_cv_5x5"] = {
        k: {"mean": statistics.mean(f[k] for f in folds), "std": statistics.pstdev(f[k] for f in folds)} for k in keys
    }
    tn = sum(f["n"] - f["positives"] for f in folds)
    res["stratified_cv_5x5"]["false_positive_rate"] = sum(f["false_positives"] for f in folds) / tn
    res["stratified_cv_5x5"]["folds"] = len(folds)
    return res


def domain_adaptation_experiment():
    base_e, base_y = prepare_training_samples()
    loc_e, loc_y = prepare_local_samples()
    tr_e, te_e, tr_y, te_y = train_test_split(loc_e, loc_y, test_size=0.5, stratify=loc_y, random_state=42)
    base = AnomalyClassifierPipeline()
    base.train(base_e, base_y)
    tuned = AnomalyClassifierPipeline()
    tuned.train(base_e + tr_e * 6, base_y + tr_y * 6)  # local split appears 1 + 5 extra times
    return {
        "holdout_n": len(te_y),
        "base": eval_pipeline(base, te_e, te_y),
        "adapted": eval_pipeline(tuned, te_e, te_y),
    }


def build_workloads():
    now = datetime.now(timezone.utc)
    mixed_lines = SYNTHETIC_SCENARIOS["normal_baseline"][:6]
    for s in SCENARIOS:
        mixed_lines = mixed_lines + SYNTHETIC_SCENARIOS[s]
    wl = {"mixed": mixed_lines}
    wl.update({s: SYNTHETIC_SCENARIOS[s] for s in SCENARIOS})
    return {
        name: [ingest_log_event(l, source="synthetic", timestamp=now + timedelta(seconds=i)) for i, l in enumerate(lines)]
        for name, lines in wl.items()
    }


def filter_events(events):
    scored = [(e, score_anomaly(e, update_state=False)) for e in events]
    return [e for e, s in scored if s.score >= THETA]


def context_for(cluster, total, retained):
    evs = [
        IncidentEventSummary(
            event_id=e.id, timestamp=e.timestamp.isoformat(), source=e.source,
            template_id=e.template_id, anomaly_score=0.0, raw_snippet=e.raw_text,
        )
        for e in cluster.events
    ]
    return ContextPayload(
        cluster_id=cluster.cluster_id, time_window_start=evs[0].timestamp, time_window_end=evs[-1].timestamp,
        total_raw_logs_processed=total, anomalous_events_count=retained, correlated_events_count=len(evs),
        reduction_ratio_pct=0.0, primary_suspect_subsystem="kernel", events=evs,
    )


def filtering_and_stages():
    wl = build_workloads()
    filt = {}
    for name, evs in wl.items():
        kept = filter_events(evs)
        filt[name] = {"raw": len(evs), "retained": len(kept), "reduction_pct": 100 * (len(evs) - len(kept)) / len(evs)}
    mixed = wl["mixed"]
    kept = filter_events(mixed)
    clusters = correlate_events(kept, window_seconds=60.0, similarity_threshold=0.08)
    local = LLMRootCauseAnalyzer()
    cluster_info = []
    for c in sorted(clusters, key=lambda c: -len(c.events)):
        r = local._local_semantic_analysis(context_for(c, len(mixed), len(kept)))
        cluster_info.append({"events": len(c.events), "local_rca_evidence": len(r.evidence), "cause": r.cause[:90]})
    stages = {
        "raw_events": len(mixed),
        "unique_templates": len({e.template_id for e in mixed}),
        "retained": len(kept),
        "clusters": len(clusters),
        "cluster_detail": cluster_info,
    }
    return filt, stages, clusters, len(mixed), len(kept)


def latency(iterations=15):
    lines = []
    for i, l in enumerate(SYNTHETIC_SCENARIOS["normal_baseline"][:6]):
        lines.append(l)
    for s in SCENARIOS:
        lines += SYNTHETIC_SCENARIOS[s]
    local = LLMRootCauseAnalyzer()
    rows = {k: [] for k in ["parse", "ml", "correlate", "context", "rca", "total"]}
    for _ in range(iterations + 2):
        now = datetime.now(timezone.utc)
        t0 = time.perf_counter()
        evs = [ingest_log_event(l, source="synthetic", timestamp=now + timedelta(seconds=i)) for i, l in enumerate(lines)]
        t1 = time.perf_counter()
        kept = filter_events(evs)
        t2 = time.perf_counter()
        clusters = correlate_events(kept, window_seconds=60.0, similarity_threshold=0.08)
        t3 = time.perf_counter()
        biggest = max(clusters, key=lambda c: len(c.events))
        ctx = context_for(biggest, len(evs), len(kept))
        ctx.model_dump_json()
        t4 = time.perf_counter()
        local._local_semantic_analysis(ctx)
        t5 = time.perf_counter()
        for k, (a, b) in zip(rows, [(t0, t1), (t1, t2), (t2, t3), (t3, t4), (t4, t5), (t0, t5)]):
            rows[k].append((b - a) * 1000)
    # drop two warm-up iterations
    return {k: {"mean_ms": statistics.mean(v[2:]), "std_ms": statistics.pstdev(v[2:])} for k, v in rows.items()} | {
        "iterations": iterations, "per_event_ml_ms": statistics.mean(rows["ml"][2:]) / len(lines),
    }


async def gemini_benchmark(clusters, total, retained, runs=3):
    analyzer = LLMRootCauseAnalyzer()
    out = []
    for c in sorted(clusters, key=lambda c: -len(c.events)):
        ctx = context_for(c, total, retained)
        valid_ids = {e.event_id for e in ctx.events}
        for r in range(runs):
            prompt = analyzer._build_prompt(ctx)
            t0 = time.perf_counter()
            try:
                raw = await analyzer._call_gemini_with_retry(prompt, ctx)
                ms = (time.perf_counter() - t0) * 1000
                cited = [e.log_event_id for e in raw.evidence]
                out.append({
                    "cluster_events": len(c.events), "run": r, "ok": True, "latency_ms": ms,
                    "engine": analyzer.last_engine, "citations": len(cited),
                    "valid_citations": sum(1 for x in cited if x in valid_ids),
                    "confidence": raw.confidence, "commands": len(raw.troubleshooting_commands),
                    "cause": raw.cause[:160],
                })
            except Exception as e:  # noqa: BLE001
                out.append({"cluster_events": len(c.events), "run": r, "ok": False, "error": str(e)[:200]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gemini", action="store_true")
    args = ap.parse_args()
    res = {
        "environment": {
            "python": sys.version.split()[0], "scikit_learn": sklearn.__version__,
            "platform": platform.platform(), "cpu_count": os.cpu_count(), "theta": THETA,
            "run_at": datetime.now(timezone.utc).isoformat(),
        },
        "classifier": classifier_experiments(),
        "domain_adaptation": domain_adaptation_experiment(),
    }
    filt, stages, clusters, total, retained = filtering_and_stages()
    res["filtering"] = filt
    res["stages"] = stages
    res["latency"] = latency()
    if args.gemini:
        res["gemini"] = asyncio.run(gemini_benchmark(clusters, total, retained))
    with open(OUT, "w") as f:
        json.dump(res, f, indent=2, default=float)
    print(json.dumps(res, indent=2, default=float))


if __name__ == "__main__":
    main()
