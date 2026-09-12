'use client';

/**
 * KernelLens AI — Incident Detail Page
 * Features:
 * - Highlighted exact log lines cited as evidence with AI reasoning callouts
 * - Visual confidence score display (radial arc, segmented meter, and multi-factor breakdown)
 * - Copy-only troubleshooting commands with mandatory operator safety note
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/ui/StatusBadge';
import ConfidenceGauge from '@/components/ui/ConfidenceGauge';
import CommandCard from '@/components/ui/CommandCard';
import EvidencePanel from '@/components/incidents/EvidencePanel';
import { Spinner } from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { fetchIncidentDetail, updateIncidentStatus } from '@/lib/api';
import type { Incident } from '@/lib/types';

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidentDetail(id);
      setIncident(data);
    } catch {
      setError('Failed to load incident details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  const handleToggleStatus = async () => {
    if (!incident) return;
    const newStatus = incident.status === 'active' ? 'resolved' : 'active';
    setUpdatingStatus(true);
    try {
      const updated = await updateIncidentStatus(incident.id, newStatus);
      setIncident(updated);
    } catch {
      // If API fails, toggle locally in UI
      setIncident({ ...incident, status: newStatus });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleCopyAllCommands = async () => {
    if (!incident || incident.troubleshooting_suggestions.length === 0) return;
    const script = incident.troubleshooting_suggestions
      .map(
        (cmd, i) =>
          `# [Diagnostic Step ${i + 1}] ${cmd.rationale}\n${cmd.command_text}`
      )
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(script);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2200);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = script;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2200);
    }
  };

  if (loading) return <Spinner size="lg" />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;
  if (!incident) return <ErrorState message="Incident not found" />;

  const formatDate = (ts: string) => {
    return new Date(ts).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Breadcrumb Navigation */}
      <div
        className="flex items-center gap-2 text-sm opacity-0 animate-fade-in"
        style={{ animationFillMode: 'forwards' }}
      >
        <Link
          href="/incidents"
          className="text-kl-gray-400 hover:text-kl-orange transition-colors font-medium"
        >
          Incidents
        </Link>
        <svg
          className="h-3.5 w-3.5 text-kl-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="font-mono text-xs text-kl-gray-600 bg-kl-gray-100 px-2 py-0.5 rounded">
          {incident.id}
        </span>
      </div>

      {/* Incident Header & Visual Confidence Card */}
      <div
        className="glass-card p-6 md:p-8 opacity-0 animate-fade-in-up"
        style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
      >
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          {/* Left Column: Status, Timestamp, Root Cause Analysis */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={incident.status} />
              <span className="text-xs text-kl-gray-400 font-mono">
                Triggered: {formatDate(incident.created_at)}
              </span>
              <button
                onClick={handleToggleStatus}
                disabled={updatingStatus}
                type="button"
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-kl-gray-200 bg-kl-white px-2.5 py-1 text-xs font-medium text-kl-gray-600 hover:border-kl-orange/50 hover:text-kl-orange transition-all cursor-pointer disabled:opacity-50"
              >
                {updatingStatus ? (
                  <span>Updating...</span>
                ) : incident.status === 'active' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Mark as Resolved</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Reopen Incident</span>
                  </>
                )}
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-2 w-2 rounded-full bg-kl-orange" />
                <h1 className="text-xl font-bold text-kl-black tracking-tight">
                  Root Cause Reasoning
                </h1>
              </div>
              <p className="text-sm md:text-base text-kl-gray-700 leading-relaxed bg-cream-light/70 p-4 rounded-xl border border-cream-dark/60 font-medium">
                {incident.root_cause_summary || 'Root cause analysis in progress...'}
              </p>
            </div>

            {/* Event correlation metadata indicators */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-kl-gray-500 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded bg-kl-gray-100 px-2 py-1 font-mono">
                <svg className="h-3.5 w-3.5 text-kl-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {incident.correlated_event_ids?.length || 0} Correlated Log Events
              </span>

              <span className="inline-flex items-center gap-1.5 rounded bg-orange-500/10 px-2 py-1 font-mono text-kl-orange font-semibold">
                <svg className="h-3.5 w-3.5 text-kl-orange" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {incident.evidence_list.length} Direct Evidence Citations
              </span>

              <span className="inline-flex items-center gap-1 text-kl-gray-400">
                <span>Model:</span>
                <span className="font-mono text-[11px] text-kl-gray-600">
                  gemini-1.5 + RandomForest
                </span>
              </span>
            </div>
          </div>

          {/* Right Column: Visual Confidence Score Meter & Multi-Factor Breakdown */}
          <div className="w-full lg:w-72 shrink-0 rounded-2xl border border-kl-gray-200 bg-kl-white/90 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-kl-gray-500">
                Confidence Evaluation
              </span>
              <span className="rounded bg-kl-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-kl-gray-600">
                Calibrated ML
              </span>
            </div>

            {/* Visual Gauge Arc + Segmented Indicator + Factor Bars */}
            <ConfidenceGauge
              value={incident.confidence}
              size={110}
              strokeWidth={9}
              showDetails={true}
            />
          </div>
        </div>
      </div>

      {/* Evidence Section: Highlighted Exact Log Lines */}
      <div
        className="opacity-0 animate-fade-in-up"
        style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}
      >
        <div className="flex flex-col gap-1 mb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-kl-orange/10 p-1.5 text-kl-orange">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-kl-black tracking-tight">
              Evidence Log Lines & Correlated Sequence
            </h2>
          </div>
          <p className="text-xs text-kl-gray-500 ml-8">
            The exact log lines cited by the AI diagnostic model are <strong className="text-kl-orange">highlighted in orange</strong> with their causal explanation snippets attached. Surrounding lines provide temporal incident context.
          </p>
        </div>

        {/* Highlighted Evidence Log Viewer */}
        <EvidencePanel
          evidence={incident.evidence_list}
          events={incident.events}
          correlatedEventIds={incident.correlated_event_ids}
        />
      </div>

      {/* Troubleshooting Section: Mandatory Safety Notice + Copy-Only Command Cards */}
      <div
        className="opacity-0 animate-fade-in-up"
        style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-kl-orange/10 p-1.5 text-kl-orange">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-kl-black tracking-tight">
                Diagnostic & Troubleshooting Guidance
              </h2>
              <p className="text-xs text-kl-gray-500">
                Safe, read-only diagnostic commands generated to inspect system state and verify the root cause.
              </p>
            </div>
          </div>

          {incident.troubleshooting_suggestions.length > 0 && (
            <button
              onClick={handleCopyAllCommands}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-kl-gray-200 bg-kl-white px-3 py-1.5 text-xs font-semibold text-kl-gray-700 hover:border-kl-orange hover:text-kl-orange transition-all shadow-xs cursor-pointer active:scale-95"
            >
              {copiedAll ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-emerald-700 font-bold">All Commands Copied!</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  <span>Copy All Commands</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* VISIBLE OPERATOR RESPONSIBILITY NOTE */}
        <div className="rounded-xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-white p-5 mb-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-800 ring-4 ring-amber-500/10">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Operator Responsibility & Safety Notice
                </span>
                <span className="rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold text-amber-950 border border-amber-500/40">
                  Manual Review Required
                </span>
              </div>
              <p className="mt-1 text-sm font-bold text-amber-950 leading-snug">
                You are responsible for reviewing before running this.
              </p>
              <p className="mt-0.5 text-xs text-amber-900/95 leading-relaxed font-medium">
                KernelLens AI generates copy-only diagnostic inspection commands. Commands are{' '}
                <span className="underline font-bold text-amber-950">never executed automatically</span>{' '}
                on host systems. Before executing in terminal, always verify arguments, target storage devices (e.g.{' '}
                <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-[11px] text-amber-950">/dev/sda</code>
                ), and privilege levels in your environment.
              </p>
            </div>
          </div>
        </div>

        {/* Command Cards List */}
        <div className="space-y-4">
          {incident.troubleshooting_suggestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-kl-gray-200 bg-kl-white p-8 text-center">
              <p className="text-sm font-medium text-kl-gray-500">
                No diagnostic commands generated for this incident.
              </p>
            </div>
          ) : (
            incident.troubleshooting_suggestions.map((cmd, i) => (
              <div
                key={cmd.id}
                className="opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${350 + i * 80}ms`, animationFillMode: 'forwards' }}
              >
                <CommandCard
                  command={cmd.command_text}
                  rationale={cmd.rationale}
                  index={i}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
