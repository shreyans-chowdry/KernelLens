/**
 * KernelLens AI — Mock Data
 * Comprehensive mock data matching the synthetic scenarios for frontend dev/demo.
 */

import type { LogEvent, Incident, PipelineStats, LogStats, TimelinePoint } from './types';

// ============================================
// Mock Log Events
// ============================================
export const MOCK_LOG_EVENTS: LogEvent[] = [
  {
    id: 'log-001',
    source: 'synthetic',
    raw_text: '[ 4200.101230] systemd[1]: high memory pressure detected on cgroup /user.slice',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    template_id: 'tpl-mem-pressure',
    parsed_fields: { log_level: 'warning', subsystem: 'systemd' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-002',
    source: 'synthetic',
    raw_text: '[ 4200.101280] postgres: page allocation failure: order:2, mode:0x14040c0(GFP_KERNEL|__GFP_COMP)',
    timestamp: new Date(Date.now() - 3598000).toISOString(),
    template_id: 'tpl-alloc-fail',
    parsed_fields: { log_level: 'error', subsystem: 'mm' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-003',
    source: 'synthetic',
    raw_text: '[ 4200.101450] Out of memory: Killed process 2841 (postgres) total-vm:8451000kB, anon-rss:7892040kB',
    timestamp: new Date(Date.now() - 3596000).toISOString(),
    template_id: 'tpl-oom-kill',
    parsed_fields: { log_level: 'crit', subsystem: 'oom_killer', pid: '2841', process: 'postgres' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-004',
    source: 'synthetic',
    raw_text: '[ 4200.101700] systemd[1]: postgresql.service: Failed with result \'oom-kill\'.',
    timestamp: new Date(Date.now() - 3594000).toISOString(),
    template_id: 'tpl-service-fail',
    parsed_fields: { log_level: 'error', subsystem: 'systemd', service: 'postgresql' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-005',
    source: 'synthetic',
    raw_text: '[ 5120.401100] sd 0:0:0:0: [sda] tag#12 FAILED Result: hostbyte=DID_OK driverbyte=DRIVER_OK',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    template_id: 'tpl-scsi-fail',
    parsed_fields: { log_level: 'error', subsystem: 'scsi', device: 'sda' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-006',
    source: 'synthetic',
    raw_text: '[ 5120.401250] Buffer I/O error on dev sda1, logical block 5242880, async page read',
    timestamp: new Date(Date.now() - 7198000).toISOString(),
    template_id: 'tpl-io-error',
    parsed_fields: { log_level: 'error', subsystem: 'block', device: 'sda1' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-007',
    source: 'synthetic',
    raw_text: '[ 5120.401310] EXT4-fs error (device sda1): ext4_lookup:1841: inode #262145: comm worker: deleted inode referenced',
    timestamp: new Date(Date.now() - 7196000).toISOString(),
    template_id: 'tpl-ext4-error',
    parsed_fields: { log_level: 'error', subsystem: 'ext4', device: 'sda1' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-008',
    source: 'synthetic',
    raw_text: '[ 5120.401450] EXT4-fs (device sda1): Remounting filesystem read-only',
    timestamp: new Date(Date.now() - 7194000).toISOString(),
    template_id: 'tpl-ext4-ro',
    parsed_fields: { log_level: 'crit', subsystem: 'ext4', device: 'sda1' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-009',
    source: 'synthetic',
    raw_text: '[ 1205.882100] python3[18492]: segfault at 7ffe00000000 ip 00007f31c2810140 sp 00007ffe01238910 error 4 in libc.so.6',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    template_id: 'tpl-segfault',
    parsed_fields: { log_level: 'error', subsystem: 'traps', process: 'python3' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-010',
    source: 'synthetic',
    raw_text: '[ 3004.120000] thermal thermal_zone0: critical temperature reached (102 C), shutting down',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    template_id: 'tpl-thermal-crit',
    parsed_fields: { log_level: 'crit', subsystem: 'thermal', temp: '102' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-011',
    source: 'synthetic',
    raw_text: '[  12.012300] usb 1-1: new high-speed USB device number 2 using xhci_hcd',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    template_id: 'tpl-usb-new',
    parsed_fields: { log_level: 'info', subsystem: 'usb' },
    host: 'linux-lab-01',
  },
  {
    id: 'log-012',
    source: 'synthetic',
    raw_text: '[  15.401200] eth0: Link is Up - 1Gbps/Full - flow control rx/tx',
    timestamp: new Date(Date.now() - 500000).toISOString(),
    template_id: 'tpl-net-link',
    parsed_fields: { log_level: 'info', subsystem: 'network', interface: 'eth0' },
    host: 'linux-lab-01',
  },
];

// ============================================
// Mock Incidents
// ============================================
export const MOCK_INCIDENTS: Incident[] = [
  {
    id: 'inc-001',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    status: 'active',
    root_cause_summary:
      'Linux Out-of-Memory (OOM) Killer terminated process \'postgres\' (PID 2841) due to critical memory exhaustion. The system\'s page allocator failed to satisfy a GFP_KERNEL allocation (order:2), indicating severe physical memory fragmentation. Total anonymous RSS was ~7.5 GB, which consumed nearly all available physical memory.',
    confidence: 0.94,
    correlated_event_ids: ['log-001', 'log-002', 'log-003', 'log-004'],
    evidence_list: [
      {
        id: 'ev-001',
        incident_id: 'inc-001',
        log_event_id: 'log-001',
        explanation_snippet: 'systemd detected high memory pressure on /user.slice, which is the initial indicator of imminent OOM conditions',
      },
      {
        id: 'ev-002',
        incident_id: 'inc-001',
        log_event_id: 'log-002',
        explanation_snippet: 'Page allocation failure with GFP_KERNEL confirms the kernel memory allocator could not satisfy requests',
      },
      {
        id: 'ev-003',
        incident_id: 'inc-001',
        log_event_id: 'log-003',
        explanation_snippet: 'OOM Killer terminated postgres (PID 2841) with 7.5GB RSS — the direct kill event',
      },
    ],
    troubleshooting_suggestions: [
      {
        id: 'ts-001',
        incident_id: 'inc-001',
        command_text: 'dmesg -T | grep -i \'oom\\|killed\\|memory\'',
        rationale: 'Review kernel OOM killer decisions and memory pressure events',
      },
      {
        id: 'ts-002',
        incident_id: 'inc-001',
        command_text: 'free -h && cat /proc/meminfo',
        rationale: 'Check current memory utilization and available swap space',
      },
      {
        id: 'ts-003',
        incident_id: 'inc-001',
        command_text: 'ps aux --sort=-%mem | head -20',
        rationale: 'Identify processes currently consuming the most memory',
      },
    ],
  },
  {
    id: 'inc-002',
    created_at: new Date(Date.now() - 7200000).toISOString(),
    status: 'active',
    root_cause_summary:
      'EXT4 filesystem on /dev/sda1 encountered unrecoverable medium errors at sector 41943040, triggering a cascade: SCSI read failure → block I/O error → EXT4 inode corruption → journal abort → forced read-only remount. This indicates physical disk degradation or bad sectors that could not be reallocated.',
    confidence: 0.91,
    correlated_event_ids: ['log-005', 'log-006', 'log-007', 'log-008'],
    evidence_list: [
      {
        id: 'ev-004',
        incident_id: 'inc-002',
        log_event_id: 'log-005',
        explanation_snippet: 'SCSI disk read failure (Medium Error) is the initial hardware-level trigger for the entire cascade',
      },
      {
        id: 'ev-005',
        incident_id: 'inc-002',
        log_event_id: 'log-007',
        explanation_snippet: 'EXT4 inode corruption detected — the filesystem has been compromised by the underlying disk errors',
      },
    ],
    troubleshooting_suggestions: [
      {
        id: 'ts-004',
        incident_id: 'inc-002',
        command_text: 'smartctl -a /dev/sda',
        rationale: 'Check S.M.A.R.T. disk health for reallocated sectors and pending errors',
      },
      {
        id: 'ts-005',
        incident_id: 'inc-002',
        command_text: 'mount | grep sda1',
        rationale: 'Verify current mount status (read-only indicates active corruption)',
      },
      {
        id: 'ts-006',
        incident_id: 'inc-002',
        command_text: 'fsck -n /dev/sda1',
        rationale: 'Dry-run filesystem check to assess extent of corruption (non-destructive)',
      },
    ],
  },
  {
    id: 'inc-003',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    status: 'active',
    root_cause_summary:
      'Repeated segmentation faults in python3 processes at consistent address 0x7ffe00000000 (libc.so.6) suggest either a corrupted shared library, a memory-corrupting bug in a C extension module, or physical memory errors affecting the libc text region.',
    confidence: 0.82,
    correlated_event_ids: ['log-009'],
    evidence_list: [
      {
        id: 'ev-006',
        incident_id: 'inc-003',
        log_event_id: 'log-009',
        explanation_snippet: 'Uniform segfault address across multiple PIDs strongly indicates a shared-library or hardware origin',
      },
    ],
    troubleshooting_suggestions: [
      {
        id: 'ts-007',
        incident_id: 'inc-003',
        command_text: 'coredumpctl list --since today',
        rationale: 'List core dumps for stack trace analysis',
      },
      {
        id: 'ts-008',
        incident_id: 'inc-003',
        command_text: 'memtester 256M 1',
        rationale: 'Quick memory test to rule out hardware RAM errors',
      },
    ],
  },
  {
    id: 'inc-004',
    created_at: new Date(Date.now() - 900000).toISOString(),
    status: 'resolved',
    root_cause_summary:
      'CPU thermal zone 0 reached critical temperature (102°C), triggering emergency throttling across all 4 CPU cores. This is well above safe operating limits and indicates cooling system failure or blocked airflow.',
    confidence: 0.88,
    correlated_event_ids: ['log-010'],
    evidence_list: [
      {
        id: 'ev-007',
        incident_id: 'inc-004',
        log_event_id: 'log-010',
        explanation_snippet: 'Critical thermal threshold breached at 102°C — well beyond safe operating limits of 85-95°C',
      },
    ],
    troubleshooting_suggestions: [
      {
        id: 'ts-009',
        incident_id: 'inc-004',
        command_text: 'sensors',
        rationale: 'Read current CPU core temperatures from hardware sensors',
      },
      {
        id: 'ts-010',
        incident_id: 'inc-004',
        command_text: 'cat /sys/class/thermal/thermal_zone*/temp',
        rationale: 'Read raw thermal zone readings from sysfs',
      },
    ],
  },
];

// ============================================
// Mock Pipeline Stats
// ============================================
export const MOCK_PIPELINE_STATS: PipelineStats = {
  total_logs: 38,
  anomaly_count: 12,
  incident_count: 4,
  active_incidents: 3,
  resolved_incidents: 1,
  reduction_ratio_pct: 68.42,
};

export const MOCK_LOG_STATS: LogStats = {
  total_logs: 38,
  anomaly_count: 12,
  sources: { dmesg: 0, journalctl: 0, file: 0, synthetic: 38 },
};

// ============================================
// Mock Timeline
// ============================================
export const MOCK_TIMELINE: TimelinePoint[] = [
  { hour: new Date(Date.now() - 7200000).toISOString(), count: 1 },
  { hour: new Date(Date.now() - 3600000).toISOString(), count: 2 },
  { hour: new Date(Date.now() - 1800000).toISOString(), count: 1 },
];
