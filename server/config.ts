export const config = {
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY ?? '',
  githubToken: process.env.GITHUB_TOKEN ?? '',
  port: parseInt(process.env.PORT ?? '3000', 10),
  qwenModel: process.env.QWEN_MODEL ?? 'qwen-plus',
};
