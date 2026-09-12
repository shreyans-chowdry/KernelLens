import asyncio
import subprocess
import shutil
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, List, Optional, Dict, Any
from backend.app.models.entities import LogEventModel
from backend.app.models.schemas import LogEventCreate
from backend.app.pipeline.parser import parse_log


def ingest_log_event(
    raw_line: str,
    source: str = "dmesg",
    host: str = "localhost",
    timestamp: Optional[datetime] = None,
) -> LogEventModel:
    """
    Core operation: ingest_log_event(raw_line, source) -> LogEvent
    Takes a raw log line, parses it via Drain3, normalizes fields,
    and instantiates a LogEventModel entity.
    """
    ts = timestamp or datetime.now(timezone.utc)
    template_id, parsed_fields = parse_log(raw_line)

    event = LogEventModel(
        id=str(uuid.uuid4()),
        source=source,
        raw_text=raw_line.strip(),
        timestamp=ts,
        template_id=template_id,
        parsed_fields=parsed_fields,
        host=host,
    )
    return event


class LinuxLogCollector:
    """
    Continuously collects Linux kernel and system logs from:
    - dmesg (Kernel Ring Buffer)
    - systemd journalctl
    - /var/log/syslog or /var/log/kern.log
    - Synthetic incident generator (for reproducible testing & cross-platform dev)
    """

    @staticmethod
    def is_tool_available(tool_name: str) -> bool:
        return shutil.which(tool_name) is not None

    @classmethod
    async def stream_dmesg(cls, follow: bool = False) -> AsyncGenerator[LogEventModel, None]:
        """
        Stream live or historical kernel buffer logs via `dmesg`.
        """
        if not cls.is_tool_available("dmesg"):
            return

        cmd = ["dmesg", "-T"]
        if follow:
            cmd.append("-w")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    yield ingest_log_event(decoded, source="dmesg")
        except Exception:
            return

    @classmethod
    async def stream_journalctl(cls, lines: int = 100, follow: bool = False) -> AsyncGenerator[LogEventModel, None]:
        """
        Stream systemd kernel messages via `journalctl -k`.
        """
        if not cls.is_tool_available("journalctl"):
            return

        cmd = ["journalctl", "-k", "-n", str(lines), "-o", "short-iso"]
        if follow:
            cmd.append("-f")

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                if decoded:
                    yield ingest_log_event(decoded, source="journalctl")
        except Exception:
            return

    @classmethod
    async def stream_file(cls, filepath: str) -> AsyncGenerator[LogEventModel, None]:
        """
        Stream log events from a local file path.
        """
        try:
            with open(filepath, "r", encoding="utf-8", errors="replace") as f:
                for line in f:
                    stripped = line.strip()
                    if stripped:
                        yield ingest_log_event(stripped, source="file")
        except Exception:
            return


# =========================================================================
# High-Fidelity Synthetic Incident Scenarios
# (Essential for reproducible testing and lab demonstrations on any machine)
# =========================================================================

SYNTHETIC_SCENARIOS: Dict[str, List[str]] = {
    "oom_killer": [
        "[ 4200.101230] systemd[1]: high memory pressure detected on cgroup /user.slice",
        "[ 4200.101280] postgres: page allocation failure: order:2, mode:0x14040c0(GFP_KERNEL|__GFP_COMP)",
        "[ 4200.101340] CPU: 3 PID: 2841 Comm: postgres Not tainted 6.8.0-31-generic #31-Ubuntu",
        "[ 4200.101390] Mem-Info:",
        "[ 4200.101410] active_anon:1982342 inactive_anon:41234 isolated_anon:0",
        "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB",
        "[ 4200.101510] oom_reaper: reaped process 2841 (postgres), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB",
        "[ 4200.101620] systemd[1]: postgresql.service: Main process exited, code=killed, status=9/KILL",
        "[ 4200.101700] systemd[1]: postgresql.service: Failed with result 'oom-kill'.",
    ],
    "ext4_disk_corruption": [
        "[ 5120.401100] sd 0:0:0:0: [sda] tag#12 FAILED Result: hostbyte=DID_OK driverbyte=DRIVER_OK cmd_age=5s",
        "[ 5120.401120] sd 0:0:0:0: [sda] tag#12 Sense Key : Medium Error [current]",
        "[ 5120.401140] sd 0:0:0:0: [sda] tag#12 Add. Sense: Unrecovered read error - auto reallocate failed",
        "[ 5120.401200] blk_update_request: critical medium error, dev sda, sector 41943040 op 0x0:(READ) flags 0x80700 phys_seg 1 prio class 2",
        "[ 5120.401250] Buffer I/O error on dev sda1, logical block 5242880, async page read",
        "[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced: 262146",
        "[ 5120.401400] Aborting journal on device sda1-8.",
        "[ 5120.401450] EXT4-fs (device sda1): Remounting filesystem read-only",
    ],
    "segfault_storm": [
        "[ 1205.882100] python3[18492]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6",
        "[ 1205.882150] traps: python3[18492] general protection fault ip:7f31c2810140 sp:7ffe01238910 error:0 in libc.so.6",
        "[ 1206.012300] python3[18501]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6",
        "[ 1206.140210] python3[18512]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6",
        "[ 1206.210000] systemd[1]: app-worker.service: Main process exited, code=dumped, status=11/SEGV",
    ],
    "thermal_throttling": [
        "[ 3004.120000] thermal thermal_zone0: critical temperature reached (102 C), shutting down",
        "[ 3004.120050] CPU0: Core temperature above threshold, cpu clock throttled (total events = 4120)",
        "[ 3004.120070] CPU1: Core temperature above threshold, cpu clock throttled (total events = 4118)",
        "[ 3004.120100] CPU2: Core temperature above threshold, cpu clock throttled (total events = 4122)",
        "[ 3004.120120] CPU3: Core temperature above threshold, cpu clock throttled (total events = 4119)",
        "[ 3004.120200] CPU0: Core temperature/speed normal",
    ],
    "normal_baseline": [
        "[  12.012300] usb 1-1: new high-speed USB device number 2 using xhci_hcd",
        "[  12.140100] usb 1-1: New USB device found, idVendor=046d, idProduct=c52b, bcdDevice=12.01",
        "[  12.140120] usb 1-1: Product: USB Receiver",
        "[  15.401200] eth0: Link is Up - 1Gbps/Full - flow control rx/tx",
        "[  20.001200] systemd[1]: Started Daily apt upgrade and clean activities.",
        "[  25.102300] cron[812]: (root) CMD (test -x /usr/sbin/anacron || { cd / && run-parts --report /etc/cron.daily; })",
    ]
}


def generate_synthetic_events(scenario_name: str, host: str = "linux-lab-01") -> List[LogEventModel]:
    """Generate a batch of LogEventModel entities for a known scenario."""
    lines = SYNTHETIC_SCENARIOS.get(scenario_name, SYNTHETIC_SCENARIOS["normal_baseline"])
    events = []
    now = datetime.now(timezone.utc)
    for i, line in enumerate(lines):
        # Stagger timestamps slightly
        event = ingest_log_event(
            raw_line=line,
            source="synthetic",
            host=host,
            timestamp=now
        )
        events.append(event)
    return events
