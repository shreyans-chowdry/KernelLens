import pytest
from pydantic import ValidationError

from backend.app.models.schemas import (
    ContextPayload,
    IncidentEventSummary,
    RootCauseAnalysisResult,
    EvidenceItem,
    CommandSuggestion,
)
from backend.app.pipeline.llm_analysis import analyze_root_cause


def test_pydantic_rejects_zero_evidence():
    """
    Part [B] requirement: Pydantic validator that rejects a 'cause' with zero evidence items.
    """
    with pytest.raises(ValidationError) as excinfo:
        RootCauseAnalysisResult(
            cause="A severe kernel fault occurred.",
            evidence=[],  # Empty evidence must be rejected
            confidence=0.85,
            troubleshooting_commands=[],
        )
    assert "at least one specific log_event_id as evidence" in str(excinfo.value)


def test_pydantic_rejects_invalid_confidence():
    """
    Part [B] requirement: Confidence must be a number in [0, 1].
    """
    with pytest.raises(ValidationError):
        RootCauseAnalysisResult(
            cause="Filesystem corrupted.",
            evidence=[EvidenceItem(log_event_id="ev-1", explanation_snippet="Disk failed")],
            confidence=1.45,  # Must be in [0, 1]
            troubleshooting_commands=[],
        )

    with pytest.raises(ValidationError):
        RootCauseAnalysisResult(
            cause="Filesystem corrupted.",
            evidence=[EvidenceItem(log_event_id="ev-1", explanation_snippet="Disk failed")],
            confidence=-0.1,  # Must be in [0, 1]
            troubleshooting_commands=[],
        )


def test_pydantic_valid_output():
    valid = RootCauseAnalysisResult(
        cause="Hardware block I/O failure on dev sda triggered EXT4 filesystem remount.",
        evidence=[
            EvidenceItem(log_event_id="ev-sda-01", explanation_snippet="blk_update_request error on sector 2048"),
            EvidenceItem(log_event_id="ev-ext4-02", explanation_snippet="EXT4-fs error referencing deleted inode"),
        ],
        confidence=0.92,
        troubleshooting_commands=[
            CommandSuggestion(command_text="dmesg -T | grep -i ext4", rationale="Inspect filesystem logs")
        ],
    )
    assert len(valid.evidence) == 2
    assert 0.0 <= valid.confidence <= 1.0


@pytest.mark.asyncio
async def test_llm_analysis_fallback_pipeline():
    context = ContextPayload(
        cluster_id="clust-storage-test",
        time_window_start="2026-09-12T10:00:00Z",
        time_window_end="2026-09-12T10:00:15Z",
        total_raw_logs_processed=100,
        anomalous_events_count=2,
        correlated_events_count=2,
        reduction_ratio_pct=98.0,
        primary_suspect_subsystem="storage_io",
        events=[
            IncidentEventSummary(
                event_id="ev-blk-1",
                timestamp="2026-09-12T10:00:01Z",
                source="dmesg",
                template_id="TMPL_blk",
                anomaly_score=0.95,
                raw_snippet="kernel: [ 1042.883921] blk_update_request: I/O error, dev sda",
            ),
            IncidentEventSummary(
                event_id="ev-ext4-2",
                timestamp="2026-09-12T10:00:03Z",
                source="dmesg",
                template_id="TMPL_ext4",
                anomaly_score=0.92,
                raw_snippet="kernel: [ 1043.109823] EXT4-fs error (device sda1): ext4_lookup: deleted inode",
            ),
        ],
    )

    result = await analyze_root_cause(context)
    assert isinstance(result, RootCauseAnalysisResult)
    assert len(result.evidence) >= 1
    cited_ids = {e.log_event_id for e in result.evidence}
    assert cited_ids.issubset({"ev-blk-1", "ev-ext4-2"})
    assert 0.0 <= result.confidence <= 1.0
    assert len(result.troubleshooting_commands) > 0
