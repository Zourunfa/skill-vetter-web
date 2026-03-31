import { config } from '../config.js';

interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

export type ProgressCallback = (step: string) => void;

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }
  return headers;
}

const ghApiHeaders = (): Record<string, string> => ({
  ...buildHeaders(),
  Accept: 'application/vnd.github.v3+json',
});

/**
 * Fetch with timeout (default 10s).
 */
async function fetchWithTimeout(url: string, init: RequestInit, ms = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve the default branch for a GitHub repo via the API.
 */
async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await fetchWithTimeout(apiUrl, { headers: ghApiHeaders() });
  if (!res.ok) {
    throw new Error(`Could not fetch repo info for ${owner}/${repo} (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? 'main';
}

/**
 * Parse a GitHub URL into owner, repo, branch, and path.
 * Supports:
 *   - https://github.com/owner/repo/tree/branch/path
 *   - https://github.com/owner/repo/blob/branch/path
 *   - https://github.com/owner/repo  (auto-resolves default branch, path = "")
 */
export async function parseGitHubUrl(
  url: string,
  onProgress?: ProgressCallback,
): Promise<ParsedGitHubUrl> {
  const patterns: RegExp[] = [
    // https://github.com/owner/repo/tree/branch/path/to/skill
    /github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo/blob/branch/path/to/SKILL.md
    /github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/,
    // https://github.com/owner/repo  (bare repo URL)
    /github\.com\/([^/]+)\/([^/]+)\/?$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const owner = match[1]!;
      const repo = match[2]!;

      // Bare repo URL — resolve default branch
      if (!match[3]) {
        onProgress?.('Resolving default branch via GitHub API...');
        const branch = await getDefaultBranch(owner, repo);
        return { owner, repo, branch, path: '' };
      }

      const branch = match[3]!;
      const path = match[4]!.replace(/\/$/, '');
      return { owner, repo, branch, path };
    }
  }

  throw new Error(
    'Invalid GitHub URL. Expected: https://github.com/{owner}/{repo} or https://github.com/{owner}/{repo}/tree/{branch}/{path}'
  );
}

/**
 * Try fetching a raw file from GitHub. Returns content or null.
 * Uses GitHub API (api.github.com) instead of raw.githubusercontent.com
 * to avoid DNS/network issues in regions where raw.githubusercontent.com is blocked.
 */
async function tryFetchFile(owner: string, repo: string, branch: string, filePath: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    const res = await fetchWithTimeout(apiUrl, { headers: ghApiHeaders() });
    if (!res.ok) return null;

    const data = (await res.json()) as { content?: string; encoding?: string; type?: string };
    if (data.type !== 'file' || !data.content || data.encoding !== 'base64') return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Use GitHub API to search for SKILL.md in a directory tree.
 * Recursively searches up to `maxDepth` levels deep.
 */
async function findSkillMdViaApi(
  owner: string,
  repo: string,
  branch: string,
  dirPath: string,
  maxDepth: number,
  onProgress?: ProgressCallback,
): Promise<string | null> {
  async function search(dirPath: string, depth: number): Promise<string | null> {
    onProgress?.(`Searching ${dirPath || '/'} ...`);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${branch}`;
    let res: Response;
    try {
      res = await fetchWithTimeout(apiUrl, { headers: ghApiHeaders() });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const entries = (await res.json()) as Array<{ name: string; path: string; type: string }>;
    if (!Array.isArray(entries)) return null;

    // Direct SKILL.md in this directory
    const direct = entries.find((e) => e.name === 'SKILL.md' && e.type === 'file');
    if (direct) return direct.path;

    // Search subdirectories
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

/**
 * Fetch SKILL.md content, automatically searching for it if not at the direct path.
 */
export async function fetchSkillMd(
  parsed: ParsedGitHubUrl,
  onProgress?: ProgressCallback,
): Promise<string> {
  const { owner, repo, branch, path } = parsed;

  // 0. Bare repo URL (path === "") — try root SKILL.md, then API search
  if (!path) {
    onProgress?.('Checking root SKILL.md...');
    const root = await tryFetchFile(owner, repo, branch, 'SKILL.md');
    if (root) return root;

    onProgress?.('Searching repository tree for SKILL.md...');
    const apiPath = await findSkillMdViaApi(owner, repo, branch, '', 3, onProgress);
    if (apiPath) {
      onProgress?.(`Found SKILL.md at ${apiPath}`);
      const content = await tryFetchFile(owner, repo, branch, apiPath);
      if (content) return content;
    }

    throw new Error(
      `Could not find SKILL.md in https://github.com/${owner}/${repo}. Tried:\n` +
      `  - SKILL.md (root)\n` +
      `  - GitHub API recursive search`
    );
  }

  // 1. Direct path is already a SKILL.md file
  if (path.endsWith('SKILL.md')) {
    onProgress?.(`Fetching ${path}...`);
    const content = await tryFetchFile(owner, repo, branch, path);
    if (content) return content;
  }

  // 2. Try path/SKILL.md
  if (!path.endsWith('SKILL.md')) {
    const directPath = `${path}/SKILL.md`;
    onProgress?.(`Trying ${directPath}...`);
    const content = await tryFetchFile(owner, repo, branch, directPath);
    if (content) return content;
  }

  // 3. Try common pattern: path/skills/{basename}/SKILL.md
  const basename = path.split('/').pop() ?? '';
  const nestedPath = `${path}/skills/${basename}/SKILL.md`;
  onProgress?.(`Trying ${nestedPath}...`);
  const nested = await tryFetchFile(owner, repo, branch, nestedPath);
  if (nested) return nested;

  // 4. Fallback: use GitHub API to search for SKILL.md in the directory tree
  onProgress?.('Searching directory tree via GitHub API...');
  const apiPath = await findSkillMdViaApi(owner, repo, branch, path, 3, onProgress);
  if (apiPath) {
    onProgress?.(`Found SKILL.md at ${apiPath}`);
    const content = await tryFetchFile(owner, repo, branch, apiPath);
    if (content) return content;
  }

  throw new Error(
    `Could not find SKILL.md in https://github.com/${owner}/${repo}/tree/${branch}/${path}. Tried:\n` +
    `  - ${path}/SKILL.md\n` +
    `  - ${nestedPath}\n` +
    `  - GitHub API recursive search`
  );
}
