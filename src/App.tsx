import { UrlInput } from './components/UrlInput';
import { VettingReport } from './components/VettingReport';
import { useVettingStream } from './hooks/useVettingStream';
import { ShieldAlert } from 'lucide-react';

export default function App() {
  const { report, status, error, steps, startVetting, reset } = useVettingStream();

  const isLoading = status === 'loading' || status === 'streaming';

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="flex flex-col items-center gap-3 mb-10">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-zinc-300" />
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
            Skill Vetter
          </h1>
        </div>
        <p className="text-sm text-zinc-500 max-w-md text-center">
          Paste a GitHub skill URL to run a security audit powered by AI.
          Checks metadata, permissions, content red flags, and typosquat risks.
        </p>
      </div>

      {/* Input */}
      <UrlInput onSubmit={startVetting} isLoading={isLoading} />

      {/* Report */}
      <div className="mt-8 w-full">
        <VettingReport report={report} status={status} error={error} steps={steps} />
      </div>

      {/* Reset */}
      {status === 'done' && (
        <button
          onClick={reset}
          className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Scan another skill
        </button>
      )}
    </div>
  );
}
