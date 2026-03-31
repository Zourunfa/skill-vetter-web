import { useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const GITHUB_URL_REGEX = /^https?:\/\/github\.com\/[^/]+\/[^/]+(\/(tree|blob)\/[^/]+\/.+)?\/?$/;

export function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setValidationError('Please enter a GitHub URL');
      return;
    }
    if (!GITHUB_URL_REGEX.test(trimmed)) {
      setValidationError('Invalid URL format. Use: https://github.com/{owner}/{repo} or https://github.com/{owner}/{repo}/tree/{branch}/{path}');
      return;
    }
    setValidationError('');
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setValidationError('');
            }}
            placeholder="https://github.com/openclaw/skills/tree/main/skills/steipete/slack"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 transition-colors font-mono"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-zinc-100 px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          {isLoading ? 'Scanning...' : 'Vet Skill'}
        </button>
      </div>
      {validationError && (
        <p className="mt-2 text-xs text-red-400">{validationError}</p>
      )}
    </form>
  );
}
