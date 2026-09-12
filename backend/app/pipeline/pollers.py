import asyncio
import json
import shutil
import logging
from datetime import datetime, timezone
from typing import AsyncGenerator, List, Optional, Callable, Dict, Any

from backend.app.models.entities import LogEventModel
from backend.app.pipeline.parser import parse_log
from backend.app.pipeline.collector import ingest_log_event, generate_synthetic_events

logger = logging.getLogger("kernellens.pollers")


class DmesgPoller:
    """
    Poller for Linux kernel ring buffer via `dmesg`.
    Maintains offset/timestamp state to poll only new messages on each cycle.
    Normalizes every dmesg entry into a LogEventModel entity.
    """

    def __init__(self, poll_interval_sec: float = 2.0):
        self.poll_interval_sec = poll_interval_sec
        self.last_seen_kernel_time: float = 0.0
        self.is_running: bool = False
        self._available: bool = shutil.which("dmesg") is not None

    def is_available(self) -> bool:
        return self._available

    def normalize_line(self, line: str, host: str = "localhost") -> LogEventModel:
        """
        Normalize a raw dmesg line into a structured LogEventModel.
        """
        template_id, parsed_fields = parse_log(line)
        kernel_time = parsed_fields.get("kernel_time")
        if kernel_time and kernel_time > self.last_seen_kernel_time:
            self.last_seen_kernel_time = kernel_time

        event = LogEventModel(
            source="dmesg",
            raw_text=line.strip(),
            timestamp=datetime.now(timezone.utc),
            template_id=template_id,
            parsed_fields=parsed_fields,
            host=host,
        )
        return event

    async def poll_once(self) -> List[LogEventModel]:
        """
        Execute one poll cycle. Reads new messages since last seen kernel time.
        """
        if not self._available:
            logger.warning("dmesg not available on this platform, returning synthetic events")
            return generate_synthetic_events("oom_killer")

        cmd = ["dmesg", "-T"]
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            lines = stdout.decode("utf-8", errors="replace").splitlines()

            new_events: List[LogEventModel] = []
            for line in lines:
                stripped = line.strip()
                if not stripped:
                    continue
                event = self.normalize_line(stripped)
                new_events.append(event)
            return new_events
        except Exception as e:
            logger.error(f"Error executing dmesg: {e}")
            return []

    async def stream(self) -> AsyncGenerator[LogEventModel, None]:
        """
        Continuously poll or stream dmesg events.
        """
        self.is_running = True
        while self.is_running:
            events = await self.poll_once()
            for ev in events:
                yield ev
            await asyncio.sleep(self.poll_interval_sec)

    def stop(self):
        self.is_running = False


class JournalctlPoller:
    """
    Poller for systemd journal via `journalctl -k`.
    Uses `-o json` when possible to capture native systemd telemetry,
    or falls back to `-o short-iso`. Maintains cursor tracking.
    Normalizes every journalctl record into a LogEventModel entity.
    """

    def __init__(self, poll_interval_sec: float = 2.0):
        self.poll_interval_sec = poll_interval_sec
        self.cursor: Optional[str] = None
        self.is_running: bool = False
        self._available: bool = shutil.which("journalctl") is not None

    def is_available(self) -> bool:
        return self._available

    def normalize_json_entry(self, entry: Dict[str, Any], default_host: str = "localhost") -> LogEventModel:
        """
        Normalize a structured journalctl JSON dictionary into a canonical LogEventModel.
        """
        raw_message = entry.get("MESSAGE", "")
        if isinstance(raw_message, list):
            raw_message = bytes(raw_message).decode("utf-8", errors="replace")

        host = entry.get("_HOSTNAME", default_host)
        subsystem = entry.get("_SYSTEMD_UNIT") or entry.get("SYSLOG_IDENTIFIER") or "kernel"

        # Timestamp from microsecond realtime timestamp
        ts_usec = entry.get("__REALTIME_TIMESTAMP")
        if ts_usec:
            ts = datetime.fromtimestamp(int(ts_usec) / 1_000_000, tz=timezone.utc)
        else:
            ts = datetime.now(timezone.utc)

        # Parse via Drain3
        template_id, parsed_fields = parse_log(raw_message)
        parsed_fields["subsystem"] = subsystem
        parsed_fields["host"] = host

        # Include systemd metadata in parsed fields
        if "_PID" in entry:
            parsed_fields["extracted_params"]["systemd_pid"] = entry["_PID"]
        if "PRIORITY" in entry:
            parsed_fields["extracted_params"]["priority"] = entry["PRIORITY"]
        if "_COMM" in entry:
            parsed_fields["extracted_params"]["comm"] = entry["_COMM"]

        event = LogEventModel(
            source="journalctl",
            raw_text=raw_message,
            timestamp=ts,
            template_id=template_id,
            parsed_fields=parsed_fields,
            host=host,
        )
        return event

    def normalize_line(self, line: str, host: str = "localhost") -> LogEventModel:
        """
        Normalize a raw text journalctl line into a LogEventModel.
        """
        template_id, parsed_fields = parse_log(line)
        return LogEventModel(
            source="journalctl",
            raw_text=line.strip(),
            timestamp=datetime.now(timezone.utc),
            template_id=template_id,
            parsed_fields=parsed_fields,
            host=host,
        )

    async def poll_once(self, lines: int = 50) -> List[LogEventModel]:
        """
        Execute one poll cycle against journalctl.
        """
        if not self._available:
            logger.warning("journalctl not available on this platform, returning synthetic events")
            return generate_synthetic_events("ext4_disk_corruption")

        # Prefer -o json for rich systemd metadata
        cmd = ["journalctl", "-k", "-n", str(lines), "-o", "json"]
        if self.cursor:
            cmd.extend(["--after-cursor", self.cursor])

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            raw_lines = stdout.decode("utf-8", errors="replace").splitlines()

            events: List[LogEventModel] = []
            for raw in raw_lines:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                    if "__CURSOR" in entry:
                        self.cursor = entry["__CURSOR"]
                    events.append(self.normalize_json_entry(entry))
                except json.JSONDecodeError:
                    events.append(self.normalize_line(raw))
            return events
        except Exception as e:
            logger.error(f"Error executing journalctl: {e}")
            return []

    async def stream(self) -> AsyncGenerator[LogEventModel, None]:
        """
        Continuously stream journalctl events.
        """
        self.is_running = True
        while self.is_running:
            events = await self.poll_once()
            for ev in events:
                yield ev
            await asyncio.sleep(self.poll_interval_sec)

    def stop(self):
        self.is_running = False
