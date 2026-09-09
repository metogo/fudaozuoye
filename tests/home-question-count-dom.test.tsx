// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeQuestionCount } from "@/components/home-question-count";
import { UiLanguageProvider, UiLanguageSwitch } from "@/components/ui-language";
import { QUESTION_STATISTICS_CHANGED } from "@/lib/learning/question-count-client";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
describe("首页全站解题次数", () => {
  it("显示服务端真实数字并随界面切换中英，不触发计数写入", async () => {
    const fetcher = vi.fn(async () => Response.json({ total: 10012 })); vi.stubGlobal("fetch", fetcher);
    render(<UiLanguageProvider><UiLanguageSwitch/><HomeQuestionCount active/></UiLanguageProvider>);
    expect(await screen.findByText("已累计解题 10,012 次")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "English interface" }));
    expect(screen.getByText("10,012 questions started")).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]).not.toContainEqual(expect.objectContaining({ method: "POST" }));
  });
  it("回首页或计数上报成功后刷新总数；非首页不请求", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ total: 10000 })).mockResolvedValueOnce(Response.json({ total: 10001 }));
    vi.stubGlobal("fetch", fetcher); const view = render(<HomeQuestionCount active={false}/>);
    expect(fetcher).not.toHaveBeenCalled(); view.rerender(<HomeQuestionCount active/>);
    expect(await screen.findByText("已累计解题 10,000 次")).toBeTruthy();
    act(() => window.dispatchEvent(new Event(QUESTION_STATISTICS_CHANGED)));
    expect(await screen.findByText("已累计解题 10,001 次")).toBeTruthy();
  });
  it("错误时不展示伪造的初始数，网络恢复后可自动恢复", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(Response.json({ total: 10002 }));
    vi.stubGlobal("fetch", fetcher); render(<HomeQuestionCount active/>);
    expect(await screen.findByText("统计暂不可用")).toBeTruthy(); expect(screen.queryByText(/10,000/)).toBeNull();
    fireEvent(window, new Event("online")); expect(await screen.findByText("已累计解题 10,002 次")).toBeTruthy();
  });
  it("卸载后停止请求和监听", async () => {
    const fetcher = vi.fn(async () => Response.json({ total: 10000 })); vi.stubGlobal("fetch", fetcher);
    const view = render(<HomeQuestionCount active/>); await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    view.unmount(); fireEvent(window, new Event("focus")); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("数字单独突出显示，统计不是按钮，辅助阅读获得完整句子", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ total: 10012 })));
    render(<HomeQuestionCount active/>);
    expect(await screen.findByText("已累计解题 10,012 次")).toBeTruthy();
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-atomic")).toBe("true");
    expect(status.getAttribute("aria-busy")).toBe("false");
    expect(status.querySelector(".home-question-count-value")?.textContent?.trim()).toBe("10,012");
    expect(status.querySelector(".home-question-count-underline")).toBeTruthy();
    expect(status.querySelector(".home-question-count-icon, .home-question-count-divider, svg")).toBeNull();
    expect(status.querySelector(".home-question-count-content")?.getAttribute("aria-hidden")).toBe("true");
    expect(status.querySelector("button, a")).toBeNull();
  });
  it("载入时保留统计区域且不显示假数字；零值和大数字保留真实精度", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ total: 0 }))
      .mockResolvedValueOnce(Response.json({ total: 123456789 }));
    vi.stubGlobal("fetch", fetcher); render(<HomeQuestionCount active/>);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("正在读取解题次数")).toBeTruthy();
    expect(await screen.findByText("已累计解题 0 次")).toBeTruthy();
    act(() => window.dispatchEvent(new Event(QUESTION_STATISTICS_CHANGED)));
    expect(await screen.findByText("已累计解题 123,456,789 次")).toBeTruthy();
    expect(screen.getByRole("status").querySelector(".home-question-count-value")?.textContent).toBe("123,456,789");
  });
});
