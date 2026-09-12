'use client';

/**
 * CommandCard — Copy-only troubleshooting command display
 * SAFETY: Strict copy-only interface with no automated execution.
 * Includes copy button, diagnostic rationale, and safety indicators.
 */

import { useState } from 'react';

interface CommandCardProps {
  command: string;
  rationale: string;
  index?: number;
}

export default function CommandCard({ command, rationale, index }: CommandCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback for non-secure contexts or older browsers
      const textarea = document.createElement('textarea');
      textarea.value = command;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="group rounded-xl border border-kl-gray-200 bg-kl-white overflow-hidden transition-all duration-200 hover:border-kl-orange/40 hover:shadow-md">
      {/* Terminal Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-kl-gray-100/80 border-b border-kl-gray-200/80 text-xs">
        <div className="flex items-center gap-2">
          {/* Terminal control dots */}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80 inline-block" />
          </div>
          <span className="font-mono text-[11px] text-kl-gray-600 font-medium ml-1">
            {index !== undefined ? `Diagnostic Command #${index + 1}` : 'Diagnostic Command'}
          </span>
        </div>

        {/* Safety Badge */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-500/20">
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            COPY-ONLY • READ-ONLY
          </span>
        </div>
      </div>

      {/* Command block with Copy Button */}
      <div className="relative bg-charcoal p-4 font-mono text-sm text-[#F3F4F6]">
        <div className="flex items-start gap-3 pr-28">
          <span className="text-kl-orange font-bold select-none">$</span>
          <code className="whitespace-pre-wrap break-all leading-relaxed text-amber-100/95 font-medium">
            {command}
          </code>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          type="button"
          aria-label="Copy diagnostic command to clipboard"
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-kl-orange/50 cursor-pointer"
          style={{
            backgroundColor: copied ? '#10B981' : 'var(--orange)',
            color: 'white',
          }}
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                />
              </svg>
              <span>Copy Command</span>
            </>
          )}
        </button>
      </div>

      {/* Rationale & Diagnostic Intent */}
      <div className="px-4 py-3 bg-cream-light/60 border-t border-kl-gray-200">
        <div className="flex items-start gap-2 text-xs leading-relaxed text-kl-gray-600">
          <span className="font-bold text-kl-orange uppercase tracking-wider text-[10px] shrink-0 pt-0.5">
            Why:
          </span>
          <span>{rationale}</span>
        </div>
      </div>
    </div>
  );
}
