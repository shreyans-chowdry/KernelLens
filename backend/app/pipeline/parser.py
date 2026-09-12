import re
import os
import json
from typing import Tuple, Dict, Any, Optional
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig
from drain3.masking import MaskingInstruction
from backend.app.core.config import settings


class KernelLogParser:
    """
    Log Parsing & Normalization Engine using Drain3 algorithm.
    Extracts log template clusters, masks dynamic variables (PIDs, hex addresses, IPs),
    and normalizes structured parameters from raw Linux kernel and syslog lines.
    """

    def __init__(self, state_file_path: Optional[str] = None):
        self.state_file_path = state_file_path or settings.DRAIN3_STATE_FILE
        self.miner = self._init_miner()

    def _init_miner(self) -> TemplateMiner:
        config = TemplateMinerConfig()
        config.drain_depth = 4
        config.drain_sim_th = 0.5
        config.drain_max_children = 100
        config.drain_max_clusters = 1024

        # Masking instructions for Linux kernel tokens
        config.masking_instructions = [
            MaskingInstruction(r"0x[0-9a-fA-F]+", "<HEX>"),
            MaskingInstruction(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "<IP>"),
            MaskingInstruction(r"(/dev/[a-zA-Z0-9_\-]+)", "<DEV>"),
            MaskingInstruction(r"(pid|PID|process)\s*[:=]?\s*(\d+)", "<PID_TAG>"),
            MaskingInstruction(r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b", "<UUID>"),
            MaskingInstruction(r"\b\d+\b", "<NUM>"),
        ]

        miner = TemplateMiner(config=config)
        return miner

    def parse_log(self, raw_text: str) -> Tuple[str, Dict[str, Any]]:
        """
        Parse raw log line:
        Returns:
            template_id (str): Unique template cluster ID
            parsed_fields (dict): Normalized fields (timestamp_sec, subsystem, log_level, extracted_params, template_str)
        """
        cleaned_text = raw_text.strip()
        parsed_fields: Dict[str, Any] = {
            "subsystem": "kernel",
            "log_level": "info",
            "timestamp_raw": None,
            "kernel_time": None,
            "extracted_params": {},
            "template_str": "",
        }

        # 1. Check for kernel ring buffer timestamp: [ 12345.678901] message
        dmesg_match = re.match(r"^\[\s*(\d+\.\d+)\]\s*(.*)$", cleaned_text)
        if dmesg_match:
            parsed_fields["kernel_time"] = float(dmesg_match.group(1))
            cleaned_text = dmesg_match.group(2).strip()

        # 2. Check for syslog header: Sep 12 17:05:31 hostname kernel: [timestamp] message
        syslog_match = re.match(
            r"^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+([\w\.\-]+)\s+([\w\.\-\[\]]+):\s*(.*)$",
            cleaned_text
        )
        if syslog_match:
            parsed_fields["timestamp_raw"] = syslog_match.group(1)
            parsed_fields["host"] = syslog_match.group(2)
            parsed_fields["subsystem"] = syslog_match.group(3)
            cleaned_text = syslog_match.group(4).strip()

        # 3. Detect log level severity keywords
        lower_line = cleaned_text.lower()
        if any(k in lower_line for k in ["panic", "emergency", "fatal", "oom-killer", "out of memory"]):
            parsed_fields["log_level"] = "crit"
        elif any(k in lower_line for k in ["error", "err", "failed", "failure", "corrupt", "fault", "segfault"]):
            parsed_fields["log_level"] = "error"
        elif any(k in lower_line for k in ["warn", "warning", "throttle", "retry"]):
            parsed_fields["log_level"] = "warning"

        # 4. Extract specific semantic parameters (PIDs, devices, hex addresses, signals)
        pids = re.findall(r"\b(?:pid|PID|process)\s*[:=]?\s*(\d+)", cleaned_text)
        if pids:
            parsed_fields["extracted_params"]["pids"] = pids

        hex_addrs = re.findall(r"\b0x[0-9a-fA-F]+\b", cleaned_text)
        if hex_addrs:
            parsed_fields["extracted_params"]["hex_addrs"] = hex_addrs[:5]

        devs = re.findall(r"/dev/[a-zA-Z0-9_\-]+", cleaned_text)
        if devs:
            parsed_fields["extracted_params"]["devices"] = devs

        signals = re.findall(r"\bsig(?:nal)?\s*[:=]?\s*(\d+)\b", cleaned_text, re.IGNORECASE)
        if signals:
            parsed_fields["extracted_params"]["signals"] = signals

        # 5. Extract Drain3 log template cluster
        result = self.miner.add_log_message(cleaned_text)
        cluster_id = f"TPL_{result['cluster_id']}"
        parsed_fields["template_str"] = result["template_mined"]
        parsed_fields["template_id"] = cluster_id

        return cluster_id, parsed_fields


# Global singleton instance
log_parser = KernelLogParser()


def parse_log(raw_text: str) -> Tuple[str, Dict[str, Any]]:
    """Helper functional interface matching the project specification."""
    return log_parser.parse_log(raw_text)
