"use client";

/* eslint-disable @next/next/no-img-element */
import { useUiText } from "./ui-language";
import { useEffect, useRef } from "react";
import { animateHomeCompanion } from "@/lib/learning/home-companion-motion";
import { HomeQuestionCount } from "./home-question-count";

export function HomeWelcomeHero({ active }: { active: boolean }) {
  const t = useUiText();
  const name = t("小逗号");
  const root = useRef<HTMLDivElement>(null);
  // 当前首页的暂停/恢复沿用状态，刷新页面后重新迎接；不写入浏览器存储。
  const visit = useRef({ introduced: false });
  useEffect(() => {
    if (active && root.current) return animateHomeCompanion(root.current, visit.current);
  }, [active, name]);

  return <div ref={root} className="home-hero home-companion">
    <h1 className="home-welcome" aria-label={t("Hey，小逗号陪你一起解题。")}>
      <span className="home-welcome-greeting">Hey,</span>
      <span className="home-companion__identity">
        <button type="button" className="home-companion__name home-welcome-title" data-companion-replay aria-label={t("小逗号，点一下和它打招呼")}>
          <span aria-hidden="true" className="home-companion__quote">{t("「")}</span>
          {Array.from(name).map((letter, index) => <span key={index} className="home-companion__letter" aria-hidden="true">{letter}</span>)}
          <span aria-hidden="true" className="home-companion__quote">{t("」")}</span>
        </button>
        <button type="button" className="home-companion__actor" data-companion-replay aria-label={t("和小逗号打招呼")}>
          <img src="/brand/comma-idle.webp" alt="" width={192} height={192} draggable={false}/>
        </button>
      </span>
      <span className="home-welcome-subtitle">{t("陪你一起解题。")}</span>
    </h1>
    <HomeQuestionCount active={active}/>
  </div>;
}
