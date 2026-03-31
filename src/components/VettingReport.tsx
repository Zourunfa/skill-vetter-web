import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Languages, Loader2 } from 'lucide-react';
import { SeverityBadge, extractVerdict } from './SeverityBadge';
import { useTranslation } from '../hooks/useTranslation';
import type { VettingStatus } from '../lib/types';

interface VettingReportProps {
  report: string;
  status: VettingStatus;
  error: string | null;
  steps: string[];
}

export function VettingReport({ report, status, error, steps }: VettingReportProps) {
  const { translated, isTranslating, error: translateError, translate, reset: resetTranslation } = useTranslation();
  const [showTranslated, setShowTranslated] = useState(false);

  const isDone = status === 'done';
  const displayText = showTranslated && translated ? translated : report;

  const handleTranslate = async () => {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translated) {
      setShowTranslated(true);
      return;
    }
    await translate(report);
    setShowTranslated(true);
  };

  const handleResetTranslation = () => {
    setShowTranslated(false);
    resetTranslation();
  };

  if (status === 'idle') return null;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl w-full rounded-lg border border-red-800/50 bg-red-950/30 p-6">
        <h3 className="text-red-400 font-semibold mb-1">Vetting Failed</h3>
        <p className="text-sm text-red-300/80">{error}</p>
        {steps.length > 0 && (
          <div className="mt-4 border-t border-red-800/30 pt-3 space-y-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                <span className="text-zinc-600 font-mono shrink-0">[{i + 1}]</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const verdict = extractVerdict(report);
  const isLoading = status === 'loading';
  const showProgress = (isLoading || status === 'streaming') && !report;

  return (
    <div className="mx-auto max-w-2xl w-full rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <h2 className="text-sm font-semibold text-zinc-300 tracking-wide uppercase">
          Vetting Report
        </h2>
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          {isDone && report && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTranslating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5" />
                )}
                {isTranslating ? 'Translating...' : showTranslated ? 'English' : '中文'}
              </button>
              {showTranslated && (
                <button
                  onClick={handleResetTranslation}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          )}
          {verdict !== 'UNKNOWN' && <SeverityBadge verdict={verdict} />}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {showProgress ? (
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-green-400">✓</span>
                <span className="text-zinc-400">{step}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
              <span>Working...</span>
            </div>
          </div>
        ) : displayText ? (
          <article className="prose prose-invert prose-sm max-w-none prose-headings:text-zinc-200 prose-p:text-zinc-300 prose-a:text-blue-400 prose-strong:text-zinc-200 prose-code:text-zinc-300 prose-pre:bg-zinc-800/50 prose-th:text-zinc-300 prose-td:text-zinc-400 prose-table:text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayText}
            </ReactMarkdown>
            {(status === 'streaming' || isTranslating) && (
              <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </article>
        ) : null}

        {translateError && (
          <p className="mt-3 text-xs text-red-400">Translation failed: {translateError}</p>
        )}
      </div>
    </div>
  );
}
