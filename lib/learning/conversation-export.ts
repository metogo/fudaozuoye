import type { ChatMessage, LearningSession } from "./types";

export function conversationExportSnapshot(messages: ChatMessage[], session: LearningSession | null, now = new Date()) {
  // Allowlist only learning content, never signed tokens, provider configuration
  // or hidden standard answers from the session object.
  return {
    exportedAt: now.toISOString(),
    filename: `专注作业-对话记录-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`,
    problem: session ? { text: session.problem.text, childWork: session.problem.childWork } : null,
    messages: messages.map(({ id, role, kind, text, createdAt, scopeLabel, status, imageUrl, surface, reference, suggestions }) => ({
      id, role, kind, text, createdAt, scopeLabel, status, imageUrl, surface,
      ...(reference ? { reference: { ...reference } } : {}),
      ...(suggestions?.length ? { suggestions: suggestions.map(({ text, scopeLabel }) => ({ text, scopeLabel })) } : {}),
    })),
    task: session?.flow.activeGate ? {
      title: session.flow.activeGate.title,
      prompt: session.flow.activeGate.prompt,
      stepBlank: session.flow.activeGate.stepBlank ? { ...session.flow.activeGate.stepBlank } : undefined,
      revealedAnswer: session.flow.activeGate.stepAnswer?.answer,
    } : null,
  };
}

export type ConversationExportSnapshot = ReturnType<typeof conversationExportSnapshot>;

export function exportTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { hour12: false });
}

export function localExportImage(url: string | undefined) {
  return url && /^(?:blob:|data:image\/(?:png|jpeg|jpg|webp|gif);)/i.test(url) ? url : undefined;
}
