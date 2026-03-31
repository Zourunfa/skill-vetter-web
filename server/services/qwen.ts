import OpenAI from 'openai';
import { config } from '../config.js';

const client = new OpenAI({
  apiKey: config.dashscopeApiKey,
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

export async function* streamVetting(
  systemPrompt: string,
  skillContent: string
): AsyncGenerator<string> {
  const stream = await client.chat.completions.create({
    model: config.qwenModel,
    temperature: 0.3,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: skillContent },
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
