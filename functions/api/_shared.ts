/**
 * Shared utilities for Cloudflare Pages Functions.
 * Adapted from server/services/github.ts and server/services/qwen.ts
 * for the Cloudflare Workers runtime (no Buffer, no OpenAI SDK).
 */

// ─── SSE helpers ───────────────────────────────────────────────

export function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
}

export function sseProgress(step: string): string {
  return `data: ${JSON.stringify({ type: 'progress', step })}\n\n`;
}

export function sseChunk(content: string): string {
  return `data: ${JSON.stringify({ type: 'chunk', content })}\n\n`;
}

export function sseDone(): string {
  return `data: ${JSON.stringify({ type: 'done' })}\n\n`;
}

export function sseError(message: string): string {
  return `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
}

// ─── GitHub service ────────────────────────────────────────────

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export type ProgressCallback = (step: string) => void;

function ghApiHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'skill-vetter-web',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string,
): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetchWithTimeout(apiUrl, {
    headers: ghApiHeaders(token),
  });
  if (!res.ok) {
    throw new Error(
      `Could not fetch repo info for ${owner}/${repo} (HTTP ${res.status})`,
    );
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? 'main';
}

export async function parseGitHubUrl(
  url: string,
  onProgress?: ProgressCallback,
  token?: string,
): Promise<ParsedGitHubUrl> {
  const patterns: RegExp[] = [
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    /github\.com\/([^/]+)\/([^/]+)\/?$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const owner = match[1]!;
      const repo = match[2]!;

      if (!match[3]) {
        onProgress?.('Resolving default branch via GitHub API...');
        const branch = await getDefaultBranch(owner, repo, token);
        return { owner, repo, branch, path: '' };
      }

      const branch = match[3]!;
      const path = match[4]!.replace(/\/$/, '');
      return { owner, repo, branch, path };
    }
  }

  throw new Error(
    'Invalid GitHub URL. Expected: https://github.com/{owner}/{repo} or https://github.com/{owner}/{repo}/tree/{branch}/{path}',
  );
}

/** Decode base64 — Workers runtime safe (no Buffer) */
function decodeBase64(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

async function tryFetchFile(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  token?: string,
): Promise<string | null> {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const res = await fetchWithTimeout(apiUrl, {
      headers: ghApiHeaders(token),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      content?: string;
      encoding?: string;
      type?: string;
    };
    if (data.type !== 'file' || !data.content || data.encoding !== 'base64')
      return null;
    return decodeBase64(data.content);
  } catch {
    return null;
  }
}

async function findSkillMdViaApi(
  owner: string,
  repo: string,
  branch: string,
  dirPath: string,
  maxDepth: number,
  onProgress?: ProgressCallback,
  token?: string,
): Promise<string | null> {
  async function search(dirPath: string, depth: number): Promise<string | null> {
    onProgress?.(`Searching ${dirPath || '/'} ...`);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(apiUrl, {
        headers: ghApiHeaders(token),
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const entries = (await res.json()) as Array<{
      name: string;
      path: string;
      type: string;
    }>;
    if (!Array.isArray(entries)) return null;

    const direct = entries.find((e) => e.name === 'SKILL.md' && e.type === 'file');
    if (direct) return direct.path;

    if (depth < maxDepth) {
      const dirs = entries.filter((e) => e.type === 'dir');
      for (const dir of dirs) {
        const found = await search(dir.path, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  return search(dirPath, 0);
}

export async function fetchSkillMd(
  parsed: ParsedGitHubUrl,
  onProgress?: ProgressCallback,
  token?: string,
): Promise<string> {
  const { owner, repo, branch, path } = parsed;

  // Bare repo URL
  if (!path) {
    onProgress?.('Checking root SKILL.md...');
    const root = await tryFetchFile(owner, repo, branch, 'SKILL.md', token);
    if (root) return root;

    onProgress?.('Searching repository tree for SKILL.md...');
    const apiPath = await findSkillMdViaApi(
      owner,
      repo,
      branch,
      '',
      3,
      onProgress,
      token,
    );
    if (apiPath) {
      onProgress?.(`Found SKILL.md at ${apiPath}`);
      const content = await tryFetchFile(owner, repo, branch, apiPath, token);
      if (content) return content;
    }

    throw new Error(
      `Could not find SKILL.md in https://github.com/${owner}/${repo}. Tried:\n` +
        `  - SKILL.md (root)\n` +
        `  - GitHub API recursive search`,
    );
  }

  // Direct path is SKILL.md
  if (path.endsWith('SKILL.md')) {
    onProgress?.(`Fetching ${path}...`);
    const content = await tryFetchFile(owner, repo, branch, path, token);
    if (content) return content;
  }

  // Try path/SKILL.md
  if (!path.endsWith('SKILL.md')) {
    const directPath = `${path}/SKILL.md`;
    onProgress?.(`Trying ${directPath}...`);
    const content = await tryFetchFile(
      owner,
      repo,
      branch,
      directPath,
      token,
    );
    if (content) return content;
  }

  // Try nested pattern
  const basename = path.split('/').pop() ?? '';
  const nestedPath = `${path}/skills/${basename}/SKILL.md`;
  onProgress?.(`Trying ${nestedPath}...`);
  const nested = await tryFetchFile(owner, repo, branch, nestedPath, token);
  if (nested) return nested;

  // API search fallback
  onProgress?.('Searching directory tree via GitHub API...');
  const apiPath = await findSkillMdViaApi(
    owner,
    repo,
    branch,
    path,
    3,
    onProgress,
    token,
  );
  if (apiPath) {
    onProgress?.(`Found SKILL.md at ${apiPath}`);
    const content = await tryFetchFile(owner, repo, branch, apiPath, token);
    if (content) return content;
  }

  throw new Error(
    `Could not find SKILL.md in https://github.com/${owner}/${repo}/tree/${branch}/${path}. Tried:\n` +
      `  - ${path}/SKILL.md\n` +
      `  - ${nestedPath}\n` +
      `  - GitHub API recursive search`,
  );
}

// ─── Qwen AI service (raw fetch, no OpenAI SDK) ───────────────

export async function* streamQwen(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userContent: string,
): AsyncGenerator<string> {
  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qwen API error (HTTP ${res.status}): ${body}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body from Qwen API');

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

      const payload = trimmed.slice(6);
      if (payload === '[DONE]') return;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Skip malformed SSE lines
      }
    }
  }
}
