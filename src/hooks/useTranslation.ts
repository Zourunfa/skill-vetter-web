import { useState, useCallback, useRef } from 'react';

interface UseTranslationResult {
  translated: string;
  isTranslating: boolean;
  error: string | null;
  translate: (text: string) => Promise<void>;
  reset: () => void;
}

export function useTranslation(): UseTranslationResult {
  const [translated, setTranslated] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const translate = useCallback(async (text: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTranslated('');
    setError(null);
    setIsTranslating(true);

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
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
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const msg = JSON.parse(trimmed.slice(6)) as { type: string; content?: string; message?: string };
          if (msg.type === 'chunk' && msg.content) {
            setTranslated((prev) => prev + msg.content);
          } else if (msg.type === 'error') {
            throw new Error(msg.message ?? 'Translation error');
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTranslated('');
    setError(null);
    setIsTranslating(false);
  }, []);

  return { translated, isTranslating, error, translate, reset };
}
