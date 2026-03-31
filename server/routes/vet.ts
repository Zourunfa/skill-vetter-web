import { Router, type Response } from 'express';
import { parseGitHubUrl, fetchSkillMd } from '../services/github.js';
import { streamVetting } from '../services/qwen.js';
import { VETTING_SYSTEM_PROMPT } from '../prompt.js';

export const vetRouter = Router();

function sendProgress(res: Response, step: string) {
  res.write(`data: ${JSON.stringify({ type: 'progress', step })}\n\n`);
}

function startSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

vetRouter.post('/vet', async (req, res) => {
  const { url } = req.body as { url?: string };

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "url" field' });
    return;
  }

  startSSE(res);
  const onProgress = (step: string) => sendProgress(res, step);

  // Parse GitHub URL
  let parsed;
  try {
    onProgress('Parsing GitHub URL...');
    parsed = await parseGitHubUrl(url, onProgress);
    onProgress(`Resolved: ${parsed.owner}/${parsed.repo} (${parsed.branch})`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`);
    res.end();
    return;
  }

  // Fetch SKILL.md
  let skillContent: string;
  try {
    if (!parsed.path) {
      onProgress('Looking for SKILL.md in repository...');
    } else {
      onProgress(`Fetching SKILL.md from ${parsed.path}...`);
    }
    skillContent = await fetchSkillMd(parsed, onProgress);
    onProgress(`Found SKILL.md (${skillContent.length} bytes)`);
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`);
    res.end();
    return;
  }

  // Stream AI vetting
  onProgress('Running security analysis...');
  try {
    for await (const chunk of streamVetting(VETTING_SYSTEM_PROMPT, skillContent)) {
      const payload = JSON.stringify({ type: 'chunk', content: chunk });
      res.write(`data: ${payload}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    const payload = JSON.stringify({ type: 'error', message: (e as Error).message });
    res.write(`data: ${payload}\n\n`);
  } finally {
    res.end();
  }
});

vetRouter.post('/translate', async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing or invalid "text" field' });
    return;
  }

  startSSE(res);

  const systemPrompt =
    'You are a professional technical translator. Translate the following Chinese text into English. ' +
    'Preserve all Markdown formatting (headers, bold, lists, tables, code blocks, etc.) exactly as-is. ' +
    'Only translate natural language text. Do not translate code, file paths, URLs, or technical identifiers. ' +
    'Output only the translated text, no explanations.';

  try {
    for await (const chunk of streamVetting(systemPrompt, text)) {
      const payload = JSON.stringify({ type: 'chunk', content: chunk });
      res.write(`data: ${payload}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  } catch (e) {
    const payload = JSON.stringify({ type: 'error', message: (e as Error).message });
    res.write(`data: ${payload}\n\n`);
  } finally {
    res.end();
  }
});
