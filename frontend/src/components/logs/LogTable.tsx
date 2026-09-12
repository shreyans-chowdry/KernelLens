'use client';

/**
 * LogTable — Scrollable log event table with source badges and anomaly indicators
 */

import { useState } from 'react';
import type { LogEvent } from '@/lib/types';

const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  dmesg: { bg: 'rgba(74, 144, 217, 0.1)', text: '#4A90D9', label: 'dmesg' },
  journalctl: { bg: 'rgba(39, 174, 96, 0.1)', text: '#27AE60', label: 'journalctl' },
  file: { bg: 'rgba(142, 68, 173, 0.1)', text: '#8E44AD', label: 'file' },
  synthetic: { bg: 'rgba(212, 120, 58, 0.1)', text: '#D4783A', label: 'synthetic' },
};

interface LogTableProps {
  logs: LogEvent[];
  onLogClick?: (log: LogEvent) => void;
}

export default function LogTable({ logs, onLogClick }: LogTableProps) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = logs.filter((log) => {
    const matchesSearch = !search || log.raw_text.toLowerCase().includes(search.toLowerCase());
    const matchesSource = !sourceFilter || log.source === sourceFilter;
    return matchesSearch && matchesSource;
  });

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="glass-card overflow-hidden animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-kl-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kl-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search log messages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-kl-gray-200 bg-kl-white py-2 pl-10 pr-4 text-sm text-kl-black placeholder:text-kl-gray-400 outline-none transition-all focus:border-kl-orange focus:ring-2 focus:ring-orange-glow"
          />
        </div>

        {/* Source filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSourceFilter('')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              !sourceFilter ? 'bg-kl-orange text-kl-white' : 'bg-kl-gray-100 text-kl-gray-600 hover:bg-kl-gray-200'
            }`}
          >
            All
          </button>
          {Object.entries(SOURCE_COLORS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setSourceFilter(sourceFilter === key ? '' : key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                sourceFilter === key ? 'bg-kl-orange text-kl-white' : 'bg-kl-gray-100 text-kl-gray-600 hover:bg-kl-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-kl-gray-200 bg-cream/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-kl-gray-400">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-kl-gray-400">Source</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-kl-gray-400">Message</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-kl-gray-400">Template</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-kl-gray-400">Host</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-kl-gray-400">
                  No log events found
                </td>
              </tr>
            ) : (
              filtered.map((log, i) => {
                const source = SOURCE_COLORS[log.source] || SOURCE_COLORS.synthetic;
                const isExpanded = expandedId === log.id;
                const level = (log.parsed_fields as Record<string, string>)?.log_level;
                const isAnomaly = level && ['crit', 'error', 'emerg', 'alert'].includes(level);

                return (
                  <tr
                    key={log.id}
                    className={`border-b border-kl-gray-100 transition-colors cursor-pointer ${
                      isAnomaly ? 'bg-error-light/30 hover:bg-error-light/50' : 'hover:bg-cream/40'
                    }`}
                    onClick={() => {
                      setExpandedId(isExpanded ? null : log.id);
                      onLogClick?.(log);
                    }}
                    style={{ animation: `fadeInUp 0.3s ease-out ${i * 30}ms forwards`, opacity: 0 }}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-xs font-medium text-kl-black">{formatTime(log.timestamp)}</div>
                      <div className="text-[10px] text-kl-gray-400">{formatDate(log.timestamp)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: source.bg, color: source.text }}
                      >
                        {source.label}
                      </span>
                    </td>
                    <td className="max-w-lg px-4 py-3">
                      <p className="truncate font-mono text-xs text-kl-black">
                        {log.raw_text}
                      </p>
                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="mt-2 rounded-lg bg-charcoal p-3 text-xs">
                          <pre className="whitespace-pre-wrap font-mono text-kl-gray-200 break-all">
                            {log.raw_text}
                          </pre>
                          {log.parsed_fields && Object.keys(log.parsed_fields).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-kl-gray-600 pt-2">
                              {Object.entries(log.parsed_fields).map(([k, v]) => (
                                <span key={k} className="rounded bg-kl-gray-600/40 px-1.5 py-0.5 text-[10px] text-kl-gray-200">
                                  {k}=<span className="text-kl-orange">{String(v)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-[10px] text-kl-gray-400">
                        {log.template_id || '—'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-kl-gray-600">
                      {log.host}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-kl-gray-200 px-4 py-3 flex items-center justify-between">
        <span className="text-xs text-kl-gray-400">
          Showing {filtered.length} of {logs.length} events
        </span>
      </div>
    </div>
  );
}
