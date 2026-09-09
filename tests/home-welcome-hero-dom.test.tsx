// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { animateHomeCompanion } = vi.hoisted(() => ({ animateHomeCompanion: vi.fn() }));
vi.mock("@/lib/learning/home-companion-motion", () => ({ animateHomeCompanion }));
vi.mock("@/components/home-question-count", () => ({ HomeQuestionCount: () => <p>已累计解题 10,000 次</p> }));
import { HomeWelcomeHero } from "@/components/home-welcome-hero";

describe("HomeWelcomeHero", () => {
  afterEach(() => {
    cleanup();
    animateHomeCompanion.mockReset();
  });

  it("只在首页进入时启动小逗号互动，并呈现可访问的品牌入口", () => {
    const { rerender } = render(<HomeWelcomeHero active={false} />);
    expect(animateHomeCompanion).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Hey，小逗号陪你一起解题。" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "小逗号，点一下和它打招呼" })).toBeTruthy();
    const actor = screen.getByRole("button", { name: "和小逗号打招呼" });
    fireEvent.click(actor);
    expect(actor.querySelector("img")?.getAttribute("src")).toBe("/brand/comma-idle.webp");
    rerender(<HomeWelcomeHero active />);
    expect(animateHomeCompanion).toHaveBeenCalledTimes(1);
    expect(animateHomeCompanion.mock.calls[0]?.[0]).toBeTruthy();
  });

  it("暂停/恢复沿用本页介绍状态，卸载后重新进入会重新迎接", () => {
    const stop = vi.fn();
    animateHomeCompanion.mockReturnValue(stop);
    const first = render(<HomeWelcomeHero active/>);
    const visit = animateHomeCompanion.mock.calls[0][1];
    expect(visit).toEqual({ introduced: false });
    visit.introduced = true;
    first.rerender(<HomeWelcomeHero active={false}/>);
    expect(stop).toHaveBeenCalledTimes(1);
    first.rerender(<HomeWelcomeHero active/>);
    expect(animateHomeCompanion.mock.calls[1][1]).toBe(visit);
    first.unmount();
    render(<HomeWelcomeHero active/>);
    expect(animateHomeCompanion.mock.calls[2][1]).toEqual({ introduced: false });
    expect(animateHomeCompanion.mock.calls[2][1]).not.toBe(visit);
  });
});
