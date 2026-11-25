"use client";

/* eslint-disable @next/next/no-img-element */
import { useUiText } from "./ui-language";
import { useEffect, useId, useRef, type MouseEvent } from "react";
import { animateHomeCompanion } from "@/lib/learning/home-companion-motion";
import { HomeQuestionCount } from "./home-question-count";

const notebookUrl = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/cuotiben/`;

export function HomeWelcomeHero({ active, statisticsEnabled = true }: { active: boolean; statisticsEnabled?: boolean }) {
  const t = useUiText();
  const name = t("小逗号");
  const speechId = useId();
  const notebookLink = useRef<HTMLAnchorElement>(null);
  const lastTap = useRef<number | null>(null);
  function greet(event: MouseEvent<HTMLButtonElement>) {
    const previous = lastTap.current;
    lastTap.current = null;
    if (event.detail === 0) return;
    // Some touch browsers report each tap as a new click with detail 1.
    if (event.detail === 2 || (previous !== null && event.timeStamp - previous < 350)) {
      notebookLink.current?.click();
    } else {
      lastTap.current = event.timeStamp;
    }
  }
  const root = useRef<HTMLDivElement>(null);
  // 当前首页的暂停/恢复沿用状态，刷新页面后重新迎接；不写入浏览器存储。
  const visit = useRef({ introduced: false });
  useEffect(() => {
    if (active && root.current) return animateHomeCompanion(root.current, visit.current);
  }, [active, name]);

  return <div ref={root} className="home-hero home-companion" data-speech="waiting">
    <h1 className="home-welcome" aria-label={t("Hey，小逗号陪你一起解题。")}>
      <span className="home-welcome-greeting">Hey,</span>
      <span className="home-companion__identity">
        <button type="button" className="home-companion__name home-welcome-title" data-companion-replay aria-label={t("小逗号，点一下和它打招呼")}>
          <span aria-hidden="true" className="home-companion__quote">{t("「")}</span>
          {Array.from(name).map((letter, index) => <span key={index} className="home-companion__letter" aria-hidden="true">{letter}</span>)}
          <span aria-hidden="true" className="home-companion__quote">{t("」")}</span>
        </button>
        <span className="home-companion__speaker">
          <a ref={notebookLink} className="home-companion__speech" href={notebookUrl} aria-label={t("打开错题本")}>
            <span>{t("告诉你个小秘密，")}<br/>{t("双击我可以进入错题本。")}</span>
          </a>
          <span id={speechId} className="sr-only">{t("双击打开错题本")}</span>
          <button type="button" className="home-companion__actor" data-companion-replay onClick={greet} aria-label={t("和小逗号打招呼")} aria-describedby={speechId}>
            <img src="/brand/comma-idle.webp" alt="" width={192} height={192} fetchPriority="high" draggable={false}/>
            <span className="home-companion__eyelids" aria-hidden="true"/>
          </button>
        </span>
      </span>
      <span className="home-welcome-subtitle">{t("陪你一起解题。")}</span>
    </h1>
    <p className="home-service-intro mt-3 text-[13px] leading-6 text-[#65756a]">{t("拍照或输入题目，一步步讲清思路。")}</p>
    {statisticsEnabled && <HomeQuestionCount active={active}/>}
  </div>;
}
