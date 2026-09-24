// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_CHOICE_KEY, BAIDU_SITE_ID, VisitorAnalytics, canResetLocalAnalytics, isAnalyticsHost, readAnalyticsChoice, safeReferrer } from "@/lib/visitor-analytics";
import { VisitorAnalyticsSettings } from "@/components/visitor-analytics";

beforeEach(() => {
  vi.useFakeTimers(); localStorage.clear();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function(this: HTMLDialogElement) { this.open = false; } },
  });
});
afterEach(() => { cleanup(); document.getElementById("baidu-visitor-analytics")?.remove(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

function fixture(host = "fudaozuoye.com") {
  const win = { document, location: new URL(`https://${host}/?private=question`),
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window) } as unknown as Window;
  const notify = vi.fn(), tracker = new VisitorAnalytics(win, notify);
  const script = () => document.getElementById("baidu-visitor-analytics") as HTMLScriptElement;
  const load = () => { const push = vi.fn(); win._hmt = { push }; script().dispatchEvent(new Event("load")); return push; };
  return { tracker, win, notify, script, load };
}

describe("访问统计边界", () => {
  it("仅正式域名启用，本地、预览和相似域名不污染统计", () => {
    expect(isAnalyticsHost("fudaozuoye.com")).toBe(true);
    expect(isAnalyticsHost("www.fudaozuoye.com")).toBe(true);
    for (const host of ["localhost", "fudaozuoye.com.evil.test", "preview.webapps.tcloudbase.com"]) {
      const { tracker, script } = fixture(host); tracker.setAllowed(true);
      expect(script()).toBeNull(); tracker.dispose();
    }
  });
  it("没有同意不加载；来源移除路径、查询、片段和凭据", () => {
    const { tracker, script } = fixture(); tracker.setSurface("chat"); tracker.setAllowed(false);
    expect(script()).toBeNull();
    expect(safeReferrer("https://name:pass@example.com/private?q=secret#text")).toBe("https://example.com/");
    expect(safeReferrer("javascript:alert(1)")).toBe(""); expect(safeReferrer("broken")).toBe("");
    for (const value of ["true", "1", "unknown", ""]) expect(readAnalyticsChoice({ getItem: () => value })).toBeNull();
    tracker.dispose();
  });
  it("初始化关闭自动 PV 和内容采集，SDK 就绪后才上报当前页面", () => {
    const { tracker, win, script, load } = fixture(); tracker.setAllowed(true);
    expect(script().src).toBe(`https://hm.baidu.com/hm.js?${BAIDU_SITE_ID}`);
    expect(script().async).toBe(true); expect(script().referrerPolicy).toBe("origin");
    expect(win._hmt).toContainEqual(["_setAutoEventTracking", false]);
    expect(win._hmt).toContainEqual(["_setAutoPageview", false]);
    tracker.setSurface("chat"); tracker.setSurface("map");
    const push = load();
    expect(push.mock.calls.filter(call => call[0][0] === "_trackPageview")).toEqual([[["_trackPageview", "/visit/knowledge-map"]]]);
    expect(JSON.stringify(push.mock.calls)).not.toContain("private");
    tracker.dispose();
  });
  it("渲染、流式更新和重复同意不重复计数，返回页面会计数", () => {
    const { tracker, load } = fixture(); tracker.setAllowed(true); const push = load();
    tracker.setSurface("home"); tracker.setAllowed(true); tracker.setSurface("chat"); tracker.setSurface("chat");
    tracker.setSurface("map"); tracker.setSurface("chat"); tracker.setSurface("home");
    expect(push.mock.calls.filter(call => call[0][0] === "_trackPageview").map(call => call[0][1])).toEqual(["/", "/visit/chat", "/visit/knowledge-map", "/visit/chat", "/"]);
    tracker.dispose();
  });
  it("撤回同意立即停止自动和手动采集，再同意只记录当前页", () => {
    const { tracker, load } = fixture(); tracker.setAllowed(true); const push = load();
    tracker.setAllowed(false); push.mockClear(); tracker.setSurface("map"); expect(push).not.toHaveBeenCalled();
    tracker.setAllowed(true); expect(push).toHaveBeenCalledWith(["_trackPageview", "/visit/knowledge-map"]);
    tracker.dispose(); expect(push).toHaveBeenCalledWith(["_setAutoTracking", false]);
  });
  it("加载途中撤回后，迟到的 SDK 也不能上报", () => {
    const { tracker, load } = fixture(); tracker.setAllowed(true); tracker.setAllowed(false); const push = load();
    expect(push).toHaveBeenCalledWith(["_setAutoTracking", false]);
    expect(push.mock.calls.some(call => call[0][0] === "_trackPageview")).toBe(false); tracker.dispose();
  });
  it.each(["error", "empty", "timeout"])("%s 失败有界、不自动重试，可以局部重试", mode => {
    const { tracker, notify, script, load } = fixture(); tracker.setAllowed(true);
    if (mode === "timeout") vi.advanceTimersByTime(8000);
    else script().dispatchEvent(new Event(mode === "empty" ? "load" : "error"));
    expect(notify).toHaveBeenLastCalledWith("error"); expect(script()).toBeNull();
    vi.advanceTimersByTime(60000); expect(script()).toBeNull();
    tracker.setAllowed(true); const push = load(); expect(push).toHaveBeenCalledWith(["_trackPageview", "/"]); tracker.dispose();
  });
  it("第三方上报抛错不影响学习，不伪装成功", () => {
    const { tracker, win, script, notify } = fixture(); tracker.setAllowed(true);
    win._hmt = { push: () => { throw new Error("blocked"); } };
    expect(() => script().dispatchEvent(new Event("load"))).not.toThrow();
    expect(notify).toHaveBeenLastCalledWith("error"); tracker.dispose();
  });
});

describe("统计同意界面", () => {
  it("首屏披露百度采集范围与监护人提示，展开详情不代表同意", () => {
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("dialog", { name: "一起让小逗号更好用" })).toBeTruthy();
    for (const text of [/同意后，百度统计会接收 IP/, /不向百度统计发送题目/, /未满 14 周岁/]) {
      expect(screen.getByText(text).closest("details")).toBeNull();
    }
    const summary = screen.getByText("查看统计范围与隐私说明");
    expect(summary.closest("details")?.open).toBe(false);
    fireEvent.click(summary);
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBeNull();
    expect(document.getElementById("baidu-visitor-analytics")).toBeNull();
    expect(screen.getByRole("button", { name: "不启用统计" })).toBeTruthy();
  });
  it("重置严格限制在本机开发模式，生产域名和生产构建均不可用", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(canResetLocalAnalytics(host, "development")).toBe(true);
      expect(canResetLocalAnalytics(host, "production")).toBe(false);
    }
    expect(canResetLocalAnalytics("fudaozuoye.com", "development")).toBe(false);
    expect(canResetLocalAnalytics("localhost.evil.test", "development")).toBe(false);
    localStorage.setItem(ANALYTICS_CHOICE_KEY, "declined");
    vi.stubEnv("NODE_ENV", "production");
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole("button", { name: "重置本地统计选择" })).toBeNull();
  });
  it.each(["accepted", "declined"] as const)("本地已有 %s 可重置并走真实同意流程，只清理统计选择", choice => {
    vi.stubEnv("NODE_ENV", "development");
    localStorage.setItem(ANALYTICS_CHOICE_KEY, choice);
    localStorage.setItem("unrelated-draft", "保留题目");
    const allowed = vi.spyOn(VisitorAnalytics.prototype, "setAllowed");
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    allowed.mockClear();
    for (const name of ["同意基础统计", "不启用统计", "Escape"]) {
      fireEvent.click(screen.getByRole("button", { name: "重置本地统计选择" }));
      expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBeNull();
      expect(allowed).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("dialog")).toBeTruthy();
      if (name === "Escape") fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
      else fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe(name === "同意基础统计" ? "accepted" : "declined");
      expect(allowed).toHaveBeenLastCalledWith(name === "同意基础统计");
      expect(localStorage.getItem("unrelated-draft")).toBe("保留题目");
      expect(document.body.style.overflow).not.toBe("hidden");
    }
    expect(document.getElementById("baidu-visitor-analytics")).toBeNull();
  });
  it("重置存储失败时明确提示，不伪装成首次访问", () => {
    vi.stubEnv("NODE_ENV", "development");
    localStorage.setItem(ANALYTICS_CHOICE_KEY, "declined");
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "重置本地统计选择" }));
    expect(screen.getByText("无法重置统计选择，请检查浏览器存储权限。")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe("declined");
  });
  it.each(["accepted", "declined"] as const)("%s 选择跨页面重新挂载保留，不需要每次点击", choice => {
    const allowed = vi.spyOn(VisitorAnalytics.prototype, "setAllowed");
    const first = render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(screen.getByRole("button", { name: choice === "accepted" ? "同意基础统计" : "不启用统计" }));
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe(choice);
    first.unmount();
    allowed.mockClear();
    const next = render(<VisitorAnalyticsSettings surface="chat"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(allowed).toHaveBeenLastCalledWith(choice === "accepted");
    expect(next.container.querySelector("details")?.open).toBe(false);
    expect(next.container.querySelector("dialog")).toBeNull();
    next.unmount();
    localStorage.clear();
    allowed.mockClear();
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(allowed).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("StrictMode 不隐式同意，拒绝后不妨碍使用，跨标签撤回生效", () => {
    const view = render(<StrictMode><VisitorAnalyticsSettings surface="home"/><textarea aria-label="题目"/></StrictMode>);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByRole("dialog").getAttribute("open")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "不启用统计" }));
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe("declined");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.change(screen.getByLabelText("题目"), { target: { value: "原题不丢失" } });
    view.rerender(<StrictMode><VisitorAnalyticsSettings surface="chat"/><textarea aria-label="题目"/></StrictMode>);
    expect((screen.getByLabelText("题目") as HTMLTextAreaElement).value).toBe("原题不丢失");
    localStorage.removeItem(ANALYTICS_CHOICE_KEY); fireEvent(window, new StorageEvent("storage", { key: ANALYTICS_CHOICE_KEY }));
    expect(document.getElementById("baidu-visitor-analytics")).toBeNull();
  });
  it("存储被禁用时不隐式启用并给出清晰说明", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
    render(<VisitorAnalyticsSettings surface="home"/>); act(() => vi.runOnlyPendingTimers());
    expect(screen.getByText(/浏览器无法保存/)).toBeTruthy(); expect(document.getElementById("baidu-visitor-analytics")).toBeNull();
  });
  it("Escape 视为不启用，关闭弹窗并恢复滚动，不阻止继续使用", () => {
    render(<VisitorAnalyticsSettings surface="home"/>);
    act(() => vi.runOnlyPendingTimers());
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(localStorage.getItem(ANALYTICS_CHOICE_KEY)).toBe("declined");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("未选择时不打断已有对话，回到首页才展示一次选择", () => {
    const view = render(<VisitorAnalyticsSettings surface="chat"/>);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    view.rerender(<VisitorAnalyticsSettings surface="home"/>);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
