import { useState, useCallback, useRef } from 'react';
import type { VettingStatus } from '../lib/types';

interface UseVettingStreamResult {
  report: string;
  status: VettingStatus;
  error: string | null;
  steps: string[];
  startVetting: (url: string) => Promise<void>;
  reset: () => void;
}

export function useVettingStream(): UseVettingStreamResult {
  const [report, setReport] = useState('');
  const [status, setStatus] = useState<VettingStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const startVetting = useCallback(async (url: string) => {
    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setReport('');
    setError(null);
    setSteps([]);
    setStatus('loading');

    try {
      const res = await fetch('/api/vet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6);
          const msg = JSON.parse(jsonStr) as { type: string; content?: string; message?: string; step?: string };
          if (msg.type === 'progress' && msg.step) {
            setSteps((prev) => [...prev, msg.step!]);
          } else if (msg.type === 'chunk' && msg.content) {
            setStatus('streaming');
            setReport((prev) => prev + msg.content);
          } else if (msg.type === 'error') {
            throw new Error(msg.message ?? 'Unknown error');
          }
          // 'done' type: just finish
        }
      }

      setStatus('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setReport('');
    setStatus('idle');
    setError(null);
    setSteps([]);
  }, []);

  return { report, status, error, steps, startVetting, reset };
}
