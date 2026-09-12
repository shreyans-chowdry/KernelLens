import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Set
from collections import deque
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from backend.app.models.entities import LogEventModel


@dataclass
class IncidentCluster:
    """
    Representation of a correlated group of candidate anomalous events.
    Forms the candidate incident boundary for context construction.
    """
    cluster_id: str
    events: List[LogEventModel] = field(default_factory=list)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None

    @property
    def event_count(self) -> int:
        return len(self.events)

    @property
    def duration_seconds(self) -> float:
        if self.start_time and self.end_time:
            return max(0.0, (self.end_time - self.start_time).total_seconds())
        return 0.0

    @property
    def event_ids(self) -> List[str]:
        return [e.id for e in self.events]


# Domain vocabulary mappings for Linux kernel fault propagation chains
SUBSYSTEM_SYNONYMS = {
    "storage_fs": [
        "io", "buffer", "sda", "sdb", "nvme", "disk", "ext4", "btrfs", "xfs",
        "inode", "sector", "block", "journal", "read-only", "fs", "lookup",
        "blocked", "task", "timeout", "kill", "hung_task", "d-state"
    ],
    "memory_oom": [
        "oom", "out of memory", "page", "allocation", "cgroup", "reaper",
        "anon-rss", "killed", "kill", "high memory pressure", "gfp_kernel",
        "code 9", "9/kill", "sigkill"
    ],
    "network": [
        "eth", "link", "carrier", "rx", "tx", "adapter", "hang", "watchdog",
        "e1000e", "igb", "drop", "unreachable", "carrier lost"
    ],
    "cpu_thermal": [
        "thermal", "throttled", "temperature", "critical", "cpu", "zone", "clock"
    ]
}


class SemanticTemporalCorrelator:
    """
    Real Event Correlation Model per Section 3.2.2 of the Review 1 Report.
    Combines:
    1. Semantic vector representation (TF-IDF over template text + extracted entities)
    2. Temporal sliding window constraint (|t_i - t_j| <= window_seconds)
    3. Cosine similarity thresholding with transitive graph clustering (connected components)
    """

    def __init__(
        self,
        window_seconds: float = 60.0,
        similarity_threshold: float = 0.08,
    ):
        self.window_seconds = window_seconds
        self.similarity_threshold = similarity_threshold
        self.vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),
            sublinear_tf=True,
            token_pattern=r"(?u)\b\w+\b|<[A-Z_]+>",
            stop_words="english",
        )

    def _extract_semantic_entities(self, text: str) -> List[str]:
        """Extract explicit domain entities (devices, comm, pids, subsystems)."""
        entities: List[str] = []
        lower = text.lower()

        # Devices (e.g., sda, sda1, nvme0n1)
        for d in re.findall(r"(?:dev|device)\s+([a-zA-Z0-9_\-]+)", lower):
            clean_d = d.replace("/dev/", "")
            entities.append(f"entity_dev_{clean_d}")

        # Process / Comm names (e.g. task worker:1841, comm worker, app-worker.service)
        for c in re.findall(r"(?:task|comm)\s+([a-zA-Z0-9_\-]+)", lower):
            clean_c = c.split(":")[0]
            entities.append(f"entity_comm_{clean_c}")

        for s in re.findall(r"([a-zA-Z0-9_\-]+)\.service", lower):
            clean_s = s.replace("app-", "")
            entities.append(f"entity_comm_{clean_s}")

        # PIDs / TIDs
        for p in re.findall(r"(?:pid|PID|process|worker:)\s*[:=]?\s*(\d+)", text):
            entities.append(f"entity_pid_{p}")

        # Subsystem domain keywords
        for domain, keywords in SUBSYSTEM_SYNONYMS.items():
            if any(k in lower for k in keywords):
                entities.append(f"domain_{domain}")

        return entities

    def _enrich_event_text(self, event: LogEventModel) -> str:
        """
        Constructs an enriched document for vectorization including template,
        raw text, and extracted semantic entities.
        """
        parts: List[str] = []

        if event.parsed_fields and event.parsed_fields.get("template_str"):
            parts.append(event.parsed_fields["template_str"])
        parts.append(event.raw_text)

        # Append explicit entity tokens with enhanced weight for causal linking
        entities = self._extract_semantic_entities(event.raw_text)
        for ent in entities:
            parts.extend([ent] * 3)

        return " ".join(parts)

    def correlate_events(
        self,
        candidate_events: List[LogEventModel],
        window_seconds: Optional[float] = None,
        similarity_threshold: Optional[float] = None,
    ) -> List[IncidentCluster]:
        """
        Groups candidate anomalous events into IncidentClusters based on joint
        temporal proximity and semantic vector similarity using connected component analysis.
        """
        if not candidate_events:
            return []

        if len(candidate_events) == 1:
            e = candidate_events[0]
            ts = e.timestamp or datetime.now(timezone.utc)
            return [
                IncidentCluster(
                    cluster_id=f"cluster_{uuid.uuid4().hex[:8]}",
                    events=[e],
                    start_time=ts,
                    end_time=ts,
                )
            ]

        window = window_seconds if window_seconds is not None else self.window_seconds
        sim_th = similarity_threshold if similarity_threshold is not None else self.similarity_threshold

        # 1. Sort events chronologically
        sorted_events = sorted(
            candidate_events,
            key=lambda e: e.timestamp or datetime.min.replace(tzinfo=timezone.utc),
        )
        n = len(sorted_events)

        # 2. Vectorize all events using TF-IDF
        enriched_texts = [self._enrich_event_text(e) for e in sorted_events]
        tfidf_matrix = self.vectorizer.fit_transform(enriched_texts)
        sim_matrix = cosine_similarity(tfidf_matrix, tfidf_matrix)

        # 3. Build Adjacency Graph: edge exists if time_gap <= window AND cosine_similarity >= sim_th
        adj: List[List[int]] = [[] for _ in range(n)]
        timestamps = [
            e.timestamp or datetime.now(timezone.utc) for e in sorted_events
        ]

        for i in range(n):
            for j in range(i + 1, n):
                time_gap = abs((timestamps[j] - timestamps[i]).total_seconds())
                if time_gap <= window and sim_matrix[i, j] >= sim_th:
                    adj[i].append(j)
                    adj[j].append(i)

        # 4. Find Connected Components (Causal Chains)
        visited: Set[int] = set()
        clusters: List[IncidentCluster] = []

        for i in range(n):
            if i not in visited:
                comp_indices: List[int] = []
                queue = deque([i])
                visited.add(i)

                while queue:
                    curr = queue.popleft()
                    comp_indices.append(curr)
                    for neighbor in adj[curr]:
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)

                comp_events = [sorted_events[idx] for idx in sorted(comp_indices)]
                start_time = min(e.timestamp or datetime.now(timezone.utc) for e in comp_events)
                end_time = max(e.timestamp or datetime.now(timezone.utc) for e in comp_events)

                cluster = IncidentCluster(
                    cluster_id=f"cluster_{uuid.uuid4().hex[:8]}",
                    events=comp_events,
                    start_time=start_time,
                    end_time=end_time,
                )
                clusters.append(cluster)

        return clusters
