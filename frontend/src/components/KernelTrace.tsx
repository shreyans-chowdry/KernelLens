'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LogEvent } from '@/lib/types';
import { formatClock, logLevel, splitKernelTime, type LogLevel } from '@/lib/format';

export interface TraceBracket {
  href: string;
  label: string;
  eventIds: string[];
  open: boolean;
}

interface KernelTraceProps {
  /** Events in chronological order (oldest first). */
  events: LogEvent[];
  /** Events drawn as tall orange spikes (ML-flagged, or cited as evidence). */
  marked: Set<string>;
  markedLabel: string;
  brackets?: TraceBracket[];
  height?: number;
  caption?: string;
}

const BASE: Record<LogLevel, number> = { info: 0.12, warning: 0.22, error: 0.32, crit: 0.42 };
const SPIKE: Record<LogLevel, number> = { info: 0.62, warning: 0.72, error: 0.86, crit: 1 };

export default function KernelTrace({
  events,
  marked,
  markedLabel,
  brackets = [],
  height = 132,
  caption,
}: KernelTraceProps) {
  const [active, setActive] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(1000);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const n = events.length;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setCanvasWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    events.forEach((e, i) => m.set(e.id, i));
    return m;
  }, [events]);

  // Overlapping incidents (or labels that would collide) go on separate rows
  const bands = useMemo(() => {
    const pxPerEvent = canvasWidth / Math.max(1, n);
    const placed = brackets
      .map((b) => {
        const idx = b.eventIds.map((id) => indexById.get(id)).filter((i): i is number => i !== undefined);
        if (!idx.length) return null;
        return { ...b, from: Math.min(...idx), to: Math.max(...idx), row: 0 };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null)
      .sort((a, b) => a.from - b.from);
    const rowEnds: number[] = [];
    for (const b of placed) {
      const labelPx = b.label.length * 7.5 + 14;
      const endPx = Math.max((b.to + 1) * pxPerEvent, b.from * pxPerEvent + labelPx);
      let row = rowEnds.findIndex((end) => end <= b.from * pxPerEvent);
      if (row === -1) {
        row = rowEnds.length;
        rowEnds.push(0);
      }
      rowEnds[row] = endPx;
      b.row = row;
    }
    return { list: placed, rows: rowEnds.length };
  }, [brackets, indexById, canvasWidth, n]);

  if (n === 0) return null;

  const markedCount = events.filter((e) => marked.has(e.id)).length;
  const xPct = (i: number) => ((i + 0.5) / n) * 100;
  const shown = active !== null ? events[active] : null;

  const pick = (clientX: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.floor(((clientX - r.left) / r.width) * n);
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      setActive((cur) => Math.max(0, Math.min(n - 1, (cur ?? (dir > 0 ? -1 : n)) + dir)));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const minWidth = Math.max(0, n * 3);

  return (
    <figure className="trace" aria-label={`Kernel trace of ${n} events, ${markedCount} ${markedLabel}`}>
      <div className="trace-scroll">
        <div className="trace-canvas" ref={canvasRef} style={{ minWidth }}>
          {bands.list.length > 0 && (
            <div className="trace-brackets" style={{ height: bands.rows * 26 + 4 }}>
              {bands.list.map((b) => (
                <Link
                  key={b.href}
                  href={b.href}
                  className={`trace-bracket ${b.open ? 'is-open' : ''}`}
                  style={{
                    top: b.row * 26 + 16,
                    left: `${(b.from / n) * 100}%`,
                    width: `max(${((b.to - b.from + 1) / n) * 100}%, 6px)`,
                  }}
                >
                  <span className="trace-bracket-label">{b.label}</span>
                </Link>
              ))}
            </div>
          )}
          <svg
            ref={svgRef}
            className="trace-svg"
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            height={height}
            tabIndex={0}
            role="img"
            aria-label="Use the left and right arrow keys to step through events"
            onMouseMove={(e) => pick(e.clientX)}
            onMouseLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
          >
            <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} className="trace-baseline" vectorEffect="non-scaling-stroke" />
            {events.map((ev, i) => {
              const lvl = logLevel(ev);
              const isMarked = marked.has(ev.id);
              const h = (isMarked ? SPIKE[lvl] : BASE[lvl]) * (height - 6);
              return (
                <line
                  key={ev.id}
                  x1={xPct(i)}
                  x2={xPct(i)}
                  y1={height - 1}
                  y2={height - 1 - h}
                  className={`trace-tick ${isMarked ? 'is-marked' : ''} ${active === i ? 'is-active' : ''}`}
                  vectorEffect="non-scaling-stroke"
                  style={{ animationDelay: `${Math.round((i / n) * 520)}ms` }}
                />
              );
            })}
          </svg>
        </div>
      </div>

      <div className="trace-readout" aria-live="polite">
        {shown ? (
          <>
            <span className="readout-time">{formatClock(shown.timestamp)}</span>
            <span className="readout-source">{shown.source}</span>
            {marked.has(shown.id) && <span className="readout-flag">{markedLabel}</span>}
            <code className="readout-line">{splitKernelTime(shown.raw_text).message}</code>
          </>
        ) : (
          <span className="readout-hint">
            {caption ?? `${n} events, oldest on the left.`} Hover or use the arrow keys to read a line.
          </span>
        )}
      </div>
    </figure>
  );
}
