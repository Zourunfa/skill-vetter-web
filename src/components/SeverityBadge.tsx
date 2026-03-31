import type { Verdict } from '../lib/types';

const VERDICT_STYLES: Record<Verdict, string> = {
  SAFE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  DANGER: 'bg-red-500/15 text-red-400 border-red-500/30',
  BLOCK: 'bg-red-900/30 text-red-300 border-red-800/50',
  UNKNOWN: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

interface SeverityBadgeProps {
  verdict: Verdict;
}

export function SeverityBadge({ verdict }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm font-semibold tracking-wide ${VERDICT_STYLES[verdict]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

/**
 * Extract verdict from the streaming report text.
 */
export function extractVerdict(text: string): Verdict {
  const match = text.match(/##\s*Verdict:\s*(SAFE|WARNING|DANGER|BLOCK)/i);
  if (match) {
    return match[1]!.toUpperCase() as Verdict;
  }
  return 'UNKNOWN';
}
