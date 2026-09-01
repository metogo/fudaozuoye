import type { LearningSession } from "../types";

export function requireImage(imageDataUrl?: string): string {
  if (!imageDataUrl) throw new Error("请先选择要发送的图片");
  return imageDataUrl;
}

export function appendUnique(values: string[], ...next: string[]): string[] {
  return [...new Set(values.concat(next))];
}

export function pathLabels(session: LearningSession, nodeIds: string[]): string[] {
  return nodeIds.map((id) => session.nodes.find((node) => node.id === id)?.title).filter((value): value is string => Boolean(value));
}
