"""
Curated local domain dataset derived from a developer's MacOS machine.
Used for the domain-adaptation fine-tuning pass per Section 3.3.
Label: 0 = Normal / Benign, 1 = Anomaly / Failure
"""

LOCAL_MAC_LOGS = [
    # =========================================================================
    # NORMAL SAMPLES (Label: 0)
    # =========================================================================
    # Linux base model often flags 'KILL' or 'exited' as anomaly. We train it that these are normal on MacOS.
    {"raw": "com.apple.xpc.launchd[1] (com.apple.mdworker.shared[78241]): Service exited due to SIGKILL | sent by mds[142]", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "com.apple.xpc.launchd[1] (com.apple.mdworker.shared[78242]): Service exited due to SIGKILL | sent by mds[142]", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "com.apple.xpc.launchd[1] (com.apple.mdworker.shared[78243]): Service exited due to SIGKILL | sent by mds[142]", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "kernel: (AppleSMC) Previous shutdown cause: 5", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "kernel: (IOThunderboltFamily) IOThunderboltSwitch<0>(0x0)::listenerCallback - Thunderbolt HPD plug event", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "syspolicyd[315]: (Security) security_exception_prompt_resolved: allowed", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "kernel: AGC:: [IGPU] Not power gating IGPU because an external display is connected", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "loginwindow[154]: USER_PROCESS: 154 console", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "kernel: process nodejs[82112] caught causing excessive wakeups. EXC_RESOURCE -> WAKEUPS", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "kernel: PMRD: display wake", "label": 0, "dataset": "MacOS_Local"},
    {"raw": "authd[124]: [com.apple.authorization:authd] rule: authenticate-developer allowed", "label": 0, "dataset": "MacOS_Local"},
    
    # =========================================================================
    # ANOMALOUS SAMPLES (Label: 1)
    # =========================================================================
    # Linux base model misses these because it expects "OOM", "panic", or "I/O error". 
    # It misses "jetsam", "abnormal code", "deny(1)".
    {"raw": "kernel: Sandbox: npm(89312) deny(1) file-write-data /usr/local/lib/node_modules", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: Sandbox: python(11212) deny(1) file-write-data /System/Library", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: memorystatus: killing_top_process pid 98112 (Google Chrome) jetsam_reason: memory-pressure", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: memorystatus: killing_top_process pid 98113 (Docker) jetsam_reason: memory-pressure", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: memorystatus: killing_top_process pid 98114 (Slack) jetsam_reason: memory-pressure", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "com.apple.xpc.launchd[1] (com.docker.backend[19284]): Service exited with abnormal code: 1", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "com.apple.xpc.launchd[1] (com.docker.backend): Service only ran for 0 seconds. Pushing respawn out by 10 seconds.", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: disk1s1: I/O error.  Failed to read sector 124112", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "kernel: panic(cpu 2 caller 0xffffff8018e38d1c): initproc exited -- exit reason namespace 2 subcode 0xa description: none", "label": 1, "dataset": "MacOS_Local"},
    {"raw": "launchd[1]: (com.apple.WindowServer[111]) Cannot spawn: Exec format error", "label": 1, "dataset": "MacOS_Local"},
]
