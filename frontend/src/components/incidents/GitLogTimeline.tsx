'use client';

/**
 * GitLogTimeline — ChronoDB-style Linear Incident History View
 * Displays incidents as a chronological commit log on a single vertical trunk spine (no branches).
 * Each node provides commit metadata, severity, confidence, in-line evidence trail preview,
 * and direct deep-linking to the full incident detail & diagnostic view.
 */

import { useState } from 'react';
import Link from 'next/link';
import type { Incident } from '@/lib/types';
import StatusBadge from '@/components/ui/StatusBadge';

interface GitLogTimelineProps {
  incidents: Incident[];
  onToggleStatus?: (id: string, newStatus: 'active' | 'resolved') => void;
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export function getIncidentSeverity(incident: Incident): {
  level: SeverityLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  const text = (incident.root_cause_summary || '').toLowerCase();
  const isCritical =
    incident.confidence >= 0.9 ||
    text.includes('oom') ||
    text.includes('out of memory') ||
    text.includes('panic') ||
    text.includes('corruption') ||
    text.includes('critical');

  if (isCritical) {
    return {
      level: 'critical',
      label: 'CRITICAL',
      color: '#E74C3C',
      bgColor: 'rgba(231, 76, 60, 0.12)',
      borderColor: 'rgba(231, 76, 60, 0.3)',
    };
  }
  if (incident.confidence >= 0.75) {
    return {
      level: 'high',
      label: 'HIGH',
      color: '#D4783A',
      bgColor: 'rgba(212, 120, 58, 0.12)',
      borderColor: 'rgba(212, 120, 58, 0.3)',
    };
  }
  if (incident.confidence >= 0.5) {
    return {
      level: 'medium',
      label: 'MEDIUM',
      color: '#F5A623',
      bgColor: 'rgba(245, 166, 35, 0.12)',
      borderColor: 'rgba(245, 166, 35, 0.3)',
    };
  }
  return {
    level: 'low',
    label: 'LOW',
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.12)',
    borderColor: 'rgba(107, 114, 128, 0.3)',
  };
}

export function detectSubsystem(text: string | null): string {
  if (!text) return 'kernel';
  const lower = text.toLowerCase();
  if (lower.includes('oom') || lower.includes('memory')) return 'memory';
  if (lower.includes('sda') || lower.includes('ext4') || lower.includes('disk') || lower.includes('i/o')) return 'storage';
  if (lower.includes('thermal') || lower.includes('cpu') || lower.includes('throttl')) return 'cpu/thermal';
  if (lower.includes('eth') || lower.includes('net') || lower.includes('link')) return 'network';
  if (lower.includes('segfault') || lower.includes('libc')) return 'memory/fault';
  return 'kernel';
}

export function getRelativeTime(isoDate: string): string {
  try {
    const diffSeconds = Math.round((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diffSeconds < 60) return 'just now';
    const diffMinutes = Math.round(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'recently';
  }
}

export default function GitLogTimeline({ incidents }: GitLogTimelineProps) {
  const [expandedIncidentIds, setExpandedIncidentIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedIncidentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyHash = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback
    }
  };

  if (incidents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-kl-gray-200 bg-kl-white p-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-kl-gray-100 text-kl-gray-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-kl-black">No incident commits match filters</h3>
        <p className="mt-1 text-xs text-kl-gray-500">
          Try clearing search terms or selecting a broader status/severity/date range.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 sm:pl-8">
      {/* Git Timeline Spine Trunk Line (continuous vertical line minus branches) */}
      <div
        className="absolute left-2.5 sm:left-3.5 top-3 bottom-6 w-0.5 bg-gradient-to-b from-kl-orange via-kl-gray-300 to-kl-gray-200"
        aria-hidden="true"
      />

      <div className="space-y-6">
        {incidents.map((incident, idx) => {
          const isExpanded = expandedIncidentIds.has(incident.id);
          const severity = getIncidentSeverity(incident);
          const subsystem = detectSubsystem(incident.root_cause_summary);
          const relativeTime = getRelativeTime(incident.created_at);
          const percent = Math.round(incident.confidence * 100);

          return (
            <div
              key={incident.id}
              className="relative group opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${idx * 70}ms`, animationFillMode: 'forwards' }}
            >
              {/* Git Commit Node on Trunk Spine */}
              <div
                className="absolute -left-6 sm:-left-8 top-4 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-kl-white ring-4 ring-cream-light shadow-xs transition-transform duration-200 group-hover:scale-110"
                style={{
                  border: `2px solid ${severity.color}`,
                }}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: severity.color }}
                />
              </div>

              {/* Git-Log Commit Card */}
              <div
                className={`rounded-xl border transition-all duration-200 ${
                  isExpanded
                    ? 'border-kl-orange/50 bg-kl-white shadow-md ring-1 ring-kl-orange/20'
                    : 'border-kl-gray-200 bg-kl-white hover:border-kl-orange/30 hover:shadow-sm'
                }`}
              >
                {/* Commit Header Bar: Hash, Subsystem, Author, Timestamp, Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kl-gray-100 bg-kl-gray-50/70 px-4 py-2.5 text-xs rounded-t-xl">
                  {/* Left: Commit ID & Author Info */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Commit Hash / Incident ID */}
                    <button
                      onClick={(e) => handleCopyHash(e, incident.id)}
                      type="button"
                      title="Copy Incident ID"
                      className="inline-flex items-center gap-1 rounded bg-kl-gray-200/80 px-2 py-0.5 font-mono text-[11px] font-bold text-kl-black hover:bg-kl-orange/20 hover:text-kl-orange transition-colors cursor-pointer"
                    >
                      <span className="text-kl-gray-400 select-none">commit</span>
                      <span>{incident.id}</span>
                      {copiedId === incident.id ? (
                        <span className="text-emerald-600 ml-0.5">✓</span>
                      ) : (
                        <svg className="h-2.5 w-2.5 text-kl-gray-400 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                        </svg>
                      )}
                    </button>

                    {/* Subsystem tag */}
                    <span className="rounded bg-kl-gray-100 px-2 py-0.5 text-[10px] font-mono text-kl-gray-600 font-semibold uppercase">
                      subsys:{subsystem}
                    </span>

                    {/* Engine Author tag */}
                    <span className="hidden sm:inline text-kl-gray-400 text-[11px]">
                      by <strong className="text-kl-gray-600 font-medium">KernelLens Engine</strong>
                    </span>
                  </div>

                  {/* Right: Timestamp & Status/Severity badges */}
                  <div className="flex items-center gap-2">
                    {/* Timestamp */}
                    <span
                      className="text-[11px] text-kl-gray-500 font-medium"
                      title={new Date(incident.created_at).toISOString()}
                    >
                      {relativeTime}
                    </span>

                    {/* Severity Pill */}
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                      style={{
                        color: severity.color,
                        backgroundColor: severity.bgColor,
                        border: `1px solid ${severity.borderColor}`,
                      }}
                    >
                      {severity.label}
                    </span>

                    {/* Status Badge */}
                    <StatusBadge status={incident.status} />
                  </div>
                </div>

                {/* Commit Message & Body */}
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      {/* Commit Subject */}
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="group/title block text-base font-bold text-kl-black hover:text-kl-orange transition-colors leading-snug"
                      >
                        {incident.root_cause_summary?.split('.')[0] || 'Kernel Fault Incident Detected'}
                        <span className="inline-block ml-1 opacity-0 group-hover/title:opacity-100 group-hover/title:translate-x-0.5 transition-all text-kl-orange">
                          →
                        </span>
                      </Link>

                      {/* Commit Body Description */}
                      <p className="text-xs text-kl-gray-600 leading-relaxed line-clamp-2">
                        {incident.root_cause_summary || 'Analysis pending...'}
                      </p>
                    </div>

                    {/* Visual Confidence Score Pill */}
                    <div className="shrink-0 flex items-center sm:flex-col sm:items-end gap-1.5 self-start pt-0.5">
                      <div className="inline-flex items-center gap-1 rounded-lg bg-cream-light border border-cream-dark px-2.5 py-1 text-xs">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor:
                              percent >= 80 ? '#10B981' : percent >= 50 ? '#D4783A' : '#EF4444',
                          }}
                        />
                        <span className="font-mono font-bold text-kl-black">{percent}%</span>
                        <span className="text-[10px] text-kl-gray-400 uppercase tracking-wide">Confidence</span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata Stats Bar & Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-kl-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Event & Evidence Counts */}
                    <div className="flex flex-wrap items-center gap-3 text-kl-gray-500 font-mono text-[11px]">
                      <span className="inline-flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        {incident.correlated_event_ids?.length || 0} events correlated
                      </span>

                      <span className="inline-flex items-center gap-1 text-kl-orange font-semibold">
                        <svg className="h-3.5 w-3.5 text-kl-orange" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {incident.evidence_list?.length || 0} evidence cited
                      </span>

                      <span className="inline-flex items-center gap-1 text-kl-gray-400">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        {incident.troubleshooting_suggestions?.length || 0} diagnostic commands
                      </span>
                    </div>

                    {/* Action Links */}
                    <div className="flex items-center gap-2">
                      {/* In-line Evidence Quick Toggle */}
                      {incident.evidence_list && incident.evidence_list.length > 0 && (
                        <button
                          onClick={() => toggleExpand(incident.id)}
                          type="button"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-kl-gray-600 hover:bg-kl-gray-100 transition-colors cursor-pointer"
                        >
                          <span>{isExpanded ? 'Hide Evidence' : 'Quick Evidence'}</span>
                          <svg
                            className={`h-3 w-3 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-kl-orange' : ''
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      )}

                      {/* Jump to Full Evidence Trail */}
                      <Link
                        href={`/incidents/${incident.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-kl-orange/10 px-3 py-1 text-xs font-bold text-kl-orange hover:bg-kl-orange hover:text-white transition-all shadow-2xs"
                      >
                        <span>Full Evidence Trail</span>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </Link>
                    </div>
                  </div>

                  {/* In-Line Evidence Trail Accordion (Git Show Commit Summary style) */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-dashed border-kl-gray-200 animate-fade-in">
                      <div className="rounded-lg bg-cream-light/80 p-3.5 border border-cream-dark/60 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-kl-black flex items-center gap-1.5">
                            <svg className="h-3.5 w-3.5 text-kl-orange" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            Evidence Trail Citations ({incident.evidence_list.length} Items):
                          </span>
                          <Link
                            href={`/incidents/${incident.id}`}
                            className="text-[11px] font-semibold text-kl-orange hover:underline"
                          >
                            Open in Full Workspace →
                          </Link>
                        </div>

                        <div className="space-y-2">
                          {incident.evidence_list.map((ev, i) => (
                            <div
                              key={ev.id}
                              className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-mono font-bold text-[10px] text-amber-900 bg-amber-500/20 px-1.5 py-0.5 rounded">
                                  Evidence #{i + 1}
                                </span>
                                {ev.log_event_id && (
                                  <span className="font-mono text-[10px] text-amber-700">
                                    Ref: {ev.log_event_id}
                                  </span>
                                )}
                              </div>
                              <p className="text-amber-950 font-medium leading-relaxed">
                                {ev.explanation_snippet}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
