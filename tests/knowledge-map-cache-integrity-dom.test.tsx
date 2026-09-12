// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useKnowledgeMap } from "@/components/use-knowledge-map";
import type { LearningSession } from "@/lib/learning/types";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("恢复同一旧题的损坏缓存时不显示完成、不发请求、不删除原数据，重试也不能绕过校验", async () => {
  const session = { requestId: "legacy-formula", problem: { text: "面积为 \frac{3 \root{3}{}}{2}" } } as LearningSession;
  const key = "problem-knowledge-map-v2:" + session.requestId;
  const stored = JSON.stringify({ identity: JSON.stringify(session.problem), map: { version: 1, rootId: "core", nodes: [
    { id: "core", title: "解三角形", summary: "概述", application: "应用", evidence: session.problem.text },
    { id: "area", title: "面积公式", summary: "概述", application: "应用", evidence: session.problem.text },
  ], edges: [{ from: "core", to: "area", kind: "application", reason: "使用面积" }] } });
  localStorage.setItem(key, stored);
  vi.stubGlobal("fetch", vi.fn());
  const { result } = renderHook(() => useKnowledgeMap(session, "signed"));
  await waitFor(() => expect(result.current.error).toContain("原题保存的公式已损坏"));
  expect(result.current.complete).toBe(false);
  expect(result.current.map).toBeNull();
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.error).toContain("原题保存的公式已损坏"));
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).toBe(stored);
});
