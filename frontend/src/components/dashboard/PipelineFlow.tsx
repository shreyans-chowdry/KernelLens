'use client';

/**
 * PipelineFlow — Visual pipeline diagram with animated flowing particles
 * Shows the full KernelLens pipeline stages with live event counts
 */

const PIPELINE_STAGES = [
  { id: 'sources', label: 'Log Sources', icon: '📋', sublabel: 'dmesg / journalctl' },
  { id: 'collection', label: 'Collection', icon: '📥', sublabel: 'Ingest & Store' },
  { id: 'parsing', label: 'Parsing', icon: '🔍', sublabel: 'Drain3 Templates' },
  { id: 'anomaly', label: 'Anomaly ML', icon: '🤖', sublabel: 'RandomForest' },
  { id: 'correlation', label: 'Correlation ML', icon: '🔗', sublabel: 'TF-IDF + Graph' },
  { id: 'context', label: 'Context Build', icon: '📦', sublabel: 'Reduction' },
  { id: 'llm', label: 'LLM Analysis', icon: '🧠', sublabel: 'Gemini' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊', sublabel: 'You Are Here' },
];

interface PipelineFlowProps {
  totalLogs?: number;
  anomalyCount?: number;
  incidentCount?: number;
}

export default function PipelineFlow({
  totalLogs = 0,
  anomalyCount = 0,
  incidentCount = 0,
}: PipelineFlowProps) {
  return (
    <div className="glass-card p-6 opacity-0 animate-fade-in-up" style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}>
      <h3 className="text-sm font-semibold text-kl-black mb-6 flex items-center gap-2">
        <svg className="h-4 w-4 text-kl-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
        Pipeline Architecture
      </h3>

      {/* Pipeline stages */}
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage.id} className="flex items-center shrink-0">
            {/* Stage card */}
            <div
              className="flex flex-col items-center gap-1.5 rounded-xl border border-kl-gray-200 bg-kl-white px-3 py-3 transition-all hover:border-kl-orange/40 hover:shadow-md hover:-translate-y-0.5 min-w-[100px] opacity-0 animate-fade-in-up"
              style={{ animationDelay: `${500 + i * 100}ms`, animationFillMode: 'forwards' }}
            >
              <span className="text-xl">{stage.icon}</span>
              <span className="text-xs font-semibold text-kl-black text-center leading-tight">{stage.label}</span>
              <span className="text-[10px] text-kl-gray-400 text-center">{stage.sublabel}</span>

              {/* Counts for relevant stages */}
              {stage.id === 'collection' && totalLogs > 0 && (
                <span className="mt-0.5 rounded-full bg-kl-gray-100 px-2 py-0.5 text-[10px] font-medium text-kl-gray-600">
                  {totalLogs} logs
                </span>
              )}
              {stage.id === 'anomaly' && anomalyCount > 0 && (
                <span className="mt-0.5 rounded-full bg-orange-glow px-2 py-0.5 text-[10px] font-medium text-kl-orange">
                  {anomalyCount} flagged
                </span>
              )}
              {stage.id === 'correlation' && incidentCount > 0 && (
                <span className="mt-0.5 rounded-full bg-error-light px-2 py-0.5 text-[10px] font-medium text-kl-error">
                  {incidentCount} incidents
                </span>
              )}
            </div>

            {/* Connector arrow */}
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="flex items-center px-1 shrink-0">
                <div className="h-0.5 w-4 bg-gradient-to-r from-kl-orange/60 to-kl-orange/20 rounded-full" />
                <svg className="h-3 w-3 text-kl-orange/40 -ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Reduction stat */}
      {totalLogs > 0 && anomalyCount > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-cream p-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-kl-orange/10">
            <svg className="h-4 w-4 text-kl-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-medium text-kl-black">
              Context Reduction: {totalLogs} logs → {anomalyCount} anomalies → {incidentCount} incidents
            </p>
            <p className="text-[10px] text-kl-gray-400">
              LLM only sees {((anomalyCount / totalLogs) * 100).toFixed(1)}% of total log volume (Novelty Point 1)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
