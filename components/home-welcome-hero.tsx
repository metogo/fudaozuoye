"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { animateHomeCompanion } from "@/lib/learning/home-companion-motion";

export function HomeWelcomeHero({ active }: { active: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active && root.current) return animateHomeCompanion(root.current);
  }, [active]);

  return <div ref={root} className="home-hero home-companion">
    <h1 className="home-welcome" aria-label="Hey，小逗号陪你一起解题。">
      <span className="home-welcome-greeting">Hey,</span>
      <span className="home-companion__identity">
        <button type="button" className="home-companion__name home-welcome-title" data-companion-replay aria-label="小逗号，点一下和它打招呼">
          <span aria-hidden="true" className="home-companion__quote">「</span>
          {Array.from("小逗号").map(letter => <span key={letter} className="home-companion__letter" aria-hidden="true">{letter}</span>)}
          <span aria-hidden="true" className="home-companion__quote">」</span>
        </button>
        <button type="button" className="home-companion__actor" data-companion-replay aria-label="和小逗号打招呼">
          <img src="/brand/comma-idle.webp" alt="" width={192} height={192} draggable={false}/>
        </button>
      </span>
      <span className="home-welcome-subtitle">陪你一起解题。</span>
    </h1>
    <p className="home-welcome-hint">拍张照，或写下题目。<br/>我们一步步来。</p>
  </div>;
}
