declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Env {
    DASHSCOPE_API_KEY: string;
    GITHUB_TOKEN?: string;
    QWEN_MODEL?: string;
  }
}

export {};
