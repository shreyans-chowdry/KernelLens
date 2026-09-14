import pytest
from backend.app.pipeline.parser import parse_log, KernelLogParser


def test_parse_dmesg_oom_log():
    line = "[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB"
    template_id, fields = parse_log(line)

    assert template_id.startswith("TPL_")
    assert fields["log_level"] == "crit"
    assert fields["kernel_time"] == 4200.101450
    assert "2841" in fields["extracted_params"].get("pids", [])
    assert "<PID_TAG>" in fields["template_str"] or "<NUM>" in fields["template_str"]


def test_parse_ext4_io_error():
    line = "[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced: 262146"
    template_id, fields = parse_log(line)

    assert template_id.startswith("TPL_")
    assert fields["log_level"] == "error"
    assert fields["kernel_time"] == 5120.401310


def test_parse_syslog_header():
    line = "Sep 12 17:05:31 ubuntu-server kernel: [ 100.500000] eth0: Link is Up - 1Gbps/Full"
    template_id, fields = parse_log(line)

    assert template_id.startswith("TPL_")
    assert fields["host"] == "ubuntu-server"
    assert "eth0" in fields["template_str"] or "Link" in fields["template_str"]


def test_parser_masks_hex_and_ips():
    parser = KernelLogParser()
    t1, f1 = parser.parse_log("[ 12.34] segfault at 0x7ffe0000 ip 0x00007f31 error 4 in libc.so")
    assert len(f1["extracted_params"].get("hex_addrs", [])) > 0

    t2, f2 = parser.parse_log("[ 15.67] drop packet from 192.168.1.100 to 10.0.0.1")
    assert "<IP>" in f2["template_str"]
