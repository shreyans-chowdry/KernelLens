'use client';

import { useState } from 'react';
import { API_BASE, ApiError, backendNotConfigured, seedDemoData } from '@/lib/api';

export function LoadingBlock({ label = 'Loading', lines = 4 }: { label?: string; lines?: number }) {
  return (
    <div className="loading-block" role="status" aria-label={label}>
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className="loading-line" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  if (backendNotConfigured()) {
    return (
      <div className="notice notice-error" role="alert">
        <p className="notice-title">This deployment is not connected to a backend</p>
        <p className="notice-body">
          The site was built without <code>NEXT_PUBLIC_API_URL</code>, so it is looking for the API at{' '}
          <code>{API_BASE}</code>, which only exists on a developer&apos;s own machine. Deploy the FastAPI backend,
          set <code>NEXT_PUBLIC_API_URL</code> to its <code>/api/v1</code> address in the hosting settings, and
          redeploy the frontend.
        </p>
      </div>
    );
  }
  const offline = error.status === null;
  return (
    <div className="notice notice-error" role="alert">
      <p className="notice-title">{offline ? 'The backend is not responding' : 'Something went wrong loading this page'}</p>
      <p className="notice-body">
        {error.message}
        {offline && (
          <>
            {' '}If it runs on a free hosting plan it may be waking up, which can take up to a minute. Locally, start it
            from the project folder with <code>uvicorn backend.app.main:app --reload</code>.
          </>
        )}
      </p>
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyPipeline({ onSeeded }: { onSeeded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const seed = async () => {
    setBusy(true);
    setErr(null);
    try {
      await seedDemoData();
      onSeeded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="empty">
      <p className="empty-title">No kernel events have been ingested yet.</p>
      <p className="empty-body">
        Stream a fault scenario with <code>python backend/run_live_presentation.py</code>, or load the
        four built-in demo incidents (OOM kill, disk corruption, segfaults, overheating).
      </p>
      <button type="button" className="btn btn-primary" onClick={seed} disabled={busy}>
        {busy ? 'Loading demo data…' : 'Load demo data'}
      </button>
      {err && <p className="field-error">{err}</p>}
      <p className="empty-foot">Connected to {API_BASE}</p>
    </div>
  );
}
