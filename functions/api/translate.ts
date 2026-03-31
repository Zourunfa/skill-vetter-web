import { sseHeaders, sseChunk, sseDone, sseError, streamQwen } from './_shared';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = (await request.json()) as { text?: string };
  const { text } = body;

  if (!text || typeof text !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing or invalid "text" field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = env.DASHSCOPE_API_KEY ?? '';
  const model = env.QWEN_MODEL ?? 'qwen-plus';

  const systemPrompt =
    'You are a professional technical translator. Translate the following English text into Chinese (Simplified). ' +
    'Preserve all Markdown formatting (headers, bold, lists, tables, code blocks, etc.) exactly as-is. ' +
    'Only translate natural language text. Do not translate code, file paths, URLs, or technical identifiers. ' +
    'Output only the translated text, no explanations.';

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: string) => controller.enqueue(encoder.encode(data));

      try {
        for await (const chunk of streamQwen(apiKey, model, systemPrompt, text)) {
          send(sseChunk(chunk));
        }
        send(sseDone());
      } catch (e) {
        send(sseError((e as Error).message));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
};
