export const models = [
  { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { id: 'anthropic/claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
  { id: 'google/gemini-4-hydrogen', name: 'Gemini 4 Hydrogen' },
  { id: 'deepseek/deepseek-v4-pro-0813', name: 'DeepSeek V4 Pro' },
];

export function modelName(id) {
  return models.find((model) => model.id === id)?.name || id;
}
