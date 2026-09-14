import pytest
from backend.app.pipeline.parser import KernelLogParser


def test_differing_pids_collapse_to_same_template():
    """
    Verify that repeated messages with different PIDs collapse to the exact same template_id.
    """
    parser = KernelLogParser()
    m1 = "Out of memory: Killed process 1234 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB"
    m2 = "Out of memory: Killed process 5678 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB"
    m3 = "Out of memory: Killed process 9999 (postgres) total-vm:8451000kB, anon-rss:7892040kB, file-rss:412kB, shmem-rss:0kB"

    t1, f1 = parser.parse_log(m1)
    t2, f2 = parser.parse_log(m2)
    t3, f3 = parser.parse_log(m3)

    assert t1 == t2 == t3, f"Templates differed: {t1} vs {t2} vs {t3}"
    assert "1234" in f1["extracted_params"]["pids"]
    assert "5678" in f2["extracted_params"]["pids"]
    assert "9999" in f3["extracted_params"]["pids"]


def test_differing_timestamps_collapse_to_same_template():
    """
    Verify that repeated dmesg lines with different timestamps collapse to the exact same template_id.
    """
    parser = KernelLogParser()
    m1 = "[    1.234567] thermal thermal_zone0: critical temperature reached (102 C), shutting down"
    m2 = "[ 4567.890123] thermal thermal_zone0: critical temperature reached (102 C), shutting down"
    m3 = "[ 99999.999999] thermal thermal_zone0: critical temperature reached (102 C), shutting down"

    t1, f1 = parser.parse_log(m1)
    t2, f2 = parser.parse_log(m2)
    t3, f3 = parser.parse_log(m3)

    assert t1 == t2 == t3, f"Templates differed across timestamps: {t1} vs {t2} vs {t3}"
    assert f1["kernel_time"] == 1.234567
    assert f2["kernel_time"] == 4567.890123
    assert f3["kernel_time"] == 99999.999999


def test_differing_hex_addresses_collapse_to_same_template():
    """
    Verify that segfaults with different memory addresses collapse to the exact same template_id.
    """
    parser = KernelLogParser()
    m1 = "python3[18492]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6"
    m2 = "python3[29145]: segfault at 7ffe11111111 ip 00007f3188888888 sp 00007ffe22222222 error 4 in libc.so.6"

    t1, f1 = parser.parse_log(m1)
    t2, f2 = parser.parse_log(m2)

    assert t1 == t2, f"Segfault templates differed: {t1} vs {t2}"


def test_differing_disk_sectors_collapse_to_same_template():
    """
    Verify that I/O errors with differing sectors and block numbers collapse to the same template_id.
    """
    parser = KernelLogParser()
    m1 = "Buffer I/O error on dev sda1, logical block 5242880, async page read"
    m2 = "Buffer I/O error on dev sda1, logical block 9999999, async page read"

    t1, f1 = parser.parse_log(m1)
    t2, f2 = parser.parse_log(m2)

    assert t1 == t2, f"Disk error templates differed: {t1} vs {t2}"
