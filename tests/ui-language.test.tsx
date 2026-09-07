// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import { UiLanguageProvider, UiLanguageSwitch, useUiText } from "@/components/ui-language";
import { englishUiCopy, translateUi, UI_LOCALE_KEY } from "@/lib/ui-copy";
import { HomeWelcomeHero } from "@/components/home-welcome-hero";
import { KnowledgeMapProgress } from "@/components/knowledge-map-progress";
import { KnowledgeConnection } from "@/components/knowledge-connection";
import { connection } from "./fixtures/knowledge-connection";
import { knowledgeMapEdges } from "@/components/knowledge-map-edges";
import { readFileSync, readdirSync } from "node:fs";
vi.mock("@/lib/learning/home-companion-motion", () => ({ animateHomeCompanion: vi.fn() }));
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <>{text}</> }));

function Fixture() {
  const t = useUiText();
  return <><UiLanguageSwitch/><span>{t("拍照发题")}</span><input aria-label="draft" defaultValue="360米的原题"/>{createPortal(<button>{t("取消")}</button>, document.body)}</>;
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UI-only language switching", () => {
  it("switches interface and portals immediately, preserving draft and remembering the choice", async () => {
    const view = render(<UiLanguageProvider><Fixture/></UiLanguageProvider>);
    expect(screen.getByText("拍照发题")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "English interface" }));
    expect(screen.getByText("Take a photo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect((screen.getByLabelText("draft") as HTMLInputElement).value).toBe("360米的原题");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem(UI_LOCALE_KEY)).toBe("en");
    view.unmount();
    render(<UiLanguageProvider><Fixture/></UiLanguageProvider>);
    await screen.findByText("Take a photo");
    fireEvent.click(screen.getByRole("button", { name: "中文界面" }));
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(UI_LOCALE_KEY)).toBe("zh");
  });

  it("rejects unsupported saved languages and follows language changes in another tab", async () => {
    localStorage.setItem(UI_LOCALE_KEY, "invalid");
    render(<UiLanguageProvider><Fixture/></UiLanguageProvider>);
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));
    localStorage.setItem(UI_LOCALE_KEY, "en");
    fireEvent(window, new StorageEvent("storage", { key: UI_LOCALE_KEY, newValue: "en" }));
    expect(screen.getByText("Take a photo")).toBeTruthy();
  });

  it("keeps switching usable and tells the user if storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
    render(<UiLanguageProvider><Fixture/></UiLanguageProvider>);
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "English interface" }));
    expect(screen.getByText("Take a photo")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("could not be saved");
  });

  it("localizes hero, progress and relationship labels but never rewrites generated concepts", () => {
    render(<UiLanguageProvider><UiLanguageSwitch/><HomeWelcomeHero active={false}/><KnowledgeMapProgress count={2} total={3} complete={false} error="" latest="原题中的面积关系" retry={vi.fn()}/><KnowledgeConnection connection={connection} onOpen={vi.fn()}/></UiLanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "English interface" }));
    expect(screen.getByRole("heading", { name: "Hey, solve it together with Comma." })).toBeTruthy();
    expect(screen.getByText("Ready 2 / 3 · 原题中的面积关系")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("2 / 3 concepts ready");
    expect(screen.getByText(connection.reason)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: connection.foundation.title }));
    expect(screen.getByText(connection.foundation.explanation)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explore in the full map →" })).toBeTruthy();
    const edges = knowledgeMapEdges([{ from: "a", to: "b", kind: "prerequisite", reason: "题目关系原文" }], null, text => translateUi("en", text));
    expect(edges[0].label).toBe("Understand first");
    expect(edges[0].source).toBe("a");
    expect(edges[0].markerEnd).toBeTruthy();
  });

  it("has English copy for every statically translated interface string", () => {
    const missing = new Set<string>();
    for (const file of readdirSync("components").filter(file => file.endsWith(".tsx"))) {
      for (const match of readFileSync(`components/${file}`, "utf8").matchAll(/\bt\("([^"]+)"[),]/g)) {
        if (!(match[1] in englishUiCopy)) missing.add(match[1]);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it("substitutes values once and preserves unknown content", () => {
    expect(translateUi("en", "已生成 {count} / {total} · {latest}", { count: 1, total: 3, latest: "题目{count}" })).toBe("Ready 1 / 3 · 题目{count}");
    expect(translateUi("en", "甲队每天修35米")).toBe("甲队每天修35米");
    expect(translateUi("en", "constructor")).toBe("constructor");
    expect(translateUi("en", "接下来要用到“面积（含阴影）”")).toBe("Next, we’ll use “面积（含阴影）”");
    expect(translateUi("en", "复制失败：permission denied")).toBe("Could not copy: permission denied");
  });
});
