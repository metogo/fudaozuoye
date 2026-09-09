// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useQuestionEntryReporting } from "@/components/use-question-entry-reporting";
import { QUESTION_ENTRY_QUEUE_KEY } from "@/lib/learning/question-count-client";

afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });
describe("题目计数触发边界", () => {
  it("同题重复点击只提交一次，只有新题才创建新ID", async () => {
    const fetcher = vi.fn(async () => Response.json({ total: 10001, counted: true })); vi.stubGlobal("fetch", fetcher);
    const view = renderHook(({ ready, epoch }) => useQuestionEntryReporting(ready, epoch), { initialProps: { ready: false, epoch: 0 } });
    act(() => { view.result.current(); view.result.current(); }); expect(fetcher).not.toHaveBeenCalled();
    view.rerender({ ready: true, epoch: 0 }); await waitFor(() => expect(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)).toBe("[]"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    view.rerender({ ready: true, epoch: 1 }); act(() => view.result.current());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0]).not.toEqual(fetcher.mock.calls[1]);
  });
  it("统计错误不抛给学习界面，保留原ID等待重试", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const view = renderHook(() => useQuestionEntryReporting(true, 0));
      expect(() => act(() => view.result.current())).not.toThrow();
      await waitFor(() => expect(warning).toHaveBeenCalled());
      expect(JSON.parse(sessionStorage.getItem(QUESTION_ENTRY_QUEUE_KEY)!)).toHaveLength(1);
    } finally { warning.mockRestore(); }
  });
});
