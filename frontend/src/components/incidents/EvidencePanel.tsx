'use client';

/**
 * EvidencePanel — Incident Log Stream with Highlighted Evidence Citations
 * Highlights the exact log lines cited as evidence, renders AI reasoning callouts,
 * and provides filter toggles between all correlated logs and evidence-only lines.
 */

import { useState, useMemo } from 'react';
import type { Evidence, LogEvent } from '@/lib/types';

interface EvidencePanelProps {
  evidence: Evidence[];
  events?: LogEvent[];
  correlatedEventIds?: string[];
}

export default function EvidencePanel({
  evidence,
  events = [],
  correlatedEventIds = [],
}: EvidencePanelProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'evidence-only'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Map evidence items by log_event_id for instant O(1) citation lookup
  const evidenceMap = useMemo(() => {
    const map = new Map<string, { snippet: string; index: number; evidenceId: string }>();
    evidence.forEach((item, idx) => {
      if (item.log_event_id) {
        map.set(item.log_event_id, {
          snippet: item.explanation_snippet,
          index: idx + 1,
          evidenceId: item.id,
        });
      }
    });
    return map;
  }, [evidence]);

  // Fallback: If events array is empty, construct pseudo-log entries from evidence
  const displayEvents: LogEvent[] = useMemo(() => {
    if (events && events.length > 0) {
      return events;
    }
    // Synthesize displayable events from evidence list if no events array was passed
    return evidence.map((e, idx) => ({
      id: e.log_event_id || `ev-log-${idx}`,
      source: 'dmesg' as const,
      raw_text: `[Evidence #${idx + 1}] Log event cited for causal cascade: ${e.log_event_id || 'ID unspecified'}`,
      timestamp: new Date().toISOString(),
      template_id: `tpl-evidence-${idx}`,
      parsed_fields: {},
      host: 'cluster-node-01',
    }));
  }, [events, evidence]);

  // Filter events based on active tab and search query
  const filteredEvents = useMemo(() => {
    return displayEvents.filter((event) => {
      const isEvidence = evidenceMap.has(event.id);
      if (filterMode === 'evidence-only' && !isEvidence) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = event.raw_text.toLowerCase().includes(q);
        const matchesId = event.id.toLowerCase().includes(q);
        const matchesCitation = evidenceMap.get(event.id)?.snippet.toLowerCase().includes(q);
        return matchesText || matchesId || matchesCitation;
      }
      return true;
    });
  }, [displayEvents, filterMode, searchQuery, evidenceMap]);

  const handleCopyLine = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const citedCount = displayEvents.filter((e) => evidenceMap.has(e.id)).length;
  const totalCount = displayEvents.length;
  const citationRatio = totalCount > 0 ? Math.round((citedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Evidence Summary Header & Control Toolbar */}
      <div className="rounded-xl border border-kl-gray-200 bg-kl-white p-4 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Metrics summary chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-kl-gray-100 px-2.5 py-1 font-medium text-kl-gray-600">
              <svg className="h-3.5 w-3.5 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M3.75 4.5h16.5m-16.5 3.75h16.5" />
              </svg>
              <span>{totalCount} Correlated Events</span>
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 border border-kl-orange/20 px-2.5 py-1 font-semibold text-kl-orange">
              <svg className="h-3.5 w-3.5 text-kl-orange" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span>{citedCount} Cited as Evidence ({citationRatio}%)</span>
            </span>
          </div>

          {/* View Toggles */}
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-kl-gray-200 p-0.5 bg-kl-gray-100">
              <button
                onClick={() => setFilterMode('all')}
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                  filterMode === 'all'
                    ? 'bg-kl-white text-kl-black shadow-xs'
                    : 'text-kl-gray-600 hover:text-kl-black'
                }`}
              >
                All Correlated ({totalCount})
              </button>
              <button
                onClick={() => setFilterMode('evidence-only')}
                type="button"
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  filterMode === 'evidence-only'
                    ? 'bg-kl-orange text-white shadow-xs'
                    : 'text-kl-orange hover:bg-orange-50'
                }`}
              >
                <span>★ Evidence Only</span>
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {citedCount}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-3 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search within this incident's correlated log stream..."
            className="w-full rounded-lg border border-kl-gray-200 bg-cream-light/40 px-3 py-1.5 pl-8 text-xs text-kl-black placeholder-kl-gray-400 focus:border-kl-orange focus:outline-hidden focus:ring-1 focus:ring-kl-orange"
          />
          <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-xs text-kl-gray-400 hover:text-kl-black"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Correlated Log Stream Viewer */}
      <div className="space-y-3">
        {filteredEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-kl-gray-200 bg-kl-white p-8 text-center">
            <p className="text-sm font-medium text-kl-gray-600">No matching log lines found</p>
            <p className="text-xs text-kl-gray-400 mt-1">Try switching to &quot;All Correlated&quot; or clearing your search query.</p>
          </div>
        ) : (
          filteredEvents.map((event, index) => {
            const citation = evidenceMap.get(event.id);
            const isCited = Boolean(citation);

            return (
              <div
                key={event.id}
                className={`relative rounded-xl border transition-all duration-200 ${
                  isCited
                    ? 'border-kl-orange/60 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-white shadow-sm ring-1 ring-kl-orange/20 border-l-4'
                    : 'border-kl-gray-200 bg-kl-white hover:border-kl-gray-300'
                }`}
              >
                {/* Top Event Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs border-b border-kl-gray-100 bg-kl-gray-50/50">
                  <div className="flex items-center gap-2">
                    {/* Source Badge */}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        event.source === 'dmesg'
                          ? 'bg-blue-100 text-blue-800'
                          : event.source === 'journalctl'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {event.source}
                    </span>

                    {/* Host & Timestamp */}
                    <span className="font-mono text-[11px] text-kl-gray-400">
                      {new Date(event.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span className="text-kl-gray-300">•</span>
                    <span className="font-mono text-[11px] text-kl-gray-400">
                      {event.host}
                    </span>
                  </div>

                  {/* Right: Citation status / Copy */}
                  <div className="flex items-center gap-2">
                    {isCited ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-kl-orange px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                        <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        CITED AS EVIDENCE #{citation?.index}
                      </span>
                    ) : (
                      <span className="text-[10px] text-kl-gray-400 font-medium">
                        Correlated Context
                      </span>
                    )}

                    <button
                      onClick={() => handleCopyLine(event.id, event.raw_text)}
                      type="button"
                      title="Copy raw log line"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-kl-gray-500 hover:bg-kl-gray-200 transition-colors cursor-pointer"
                    >
                      {copiedId === event.id ? (
                        <span className="text-emerald-600 font-semibold">✓ Copied</span>
                      ) : (
                        <span>Copy Line</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Raw Log Line */}
                <div className="p-3.5">
                  <div
                    className={`rounded-lg p-3 font-mono text-xs leading-relaxed overflow-x-auto ${
                      isCited
                        ? 'bg-charcoal text-amber-100 font-medium border border-amber-500/30'
                        : 'bg-kl-gray-100 text-kl-gray-700'
                    }`}
                  >
                    <code className="whitespace-pre-wrap break-all select-all">
                      {event.raw_text}
                    </code>
                  </div>

                  {/* Highlighted AI Causal Citation Box (Displayed directly under cited lines) */}
                  {isCited && citation && (
                    <div className="mt-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 rounded-full bg-kl-orange p-1 text-white shrink-0">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px]">
                              AI Causal Citation Reasoning:
                            </span>
                            <span className="font-mono text-[9px] text-amber-700">
                              Event Ref: {event.id}
                            </span>
                          </div>
                          <p className="text-amber-950 font-medium leading-relaxed">
                            {citation.snippet}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
