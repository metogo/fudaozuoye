"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef } from "react";
import { createWelcomeVisitGuard, welcomeKeyframes, welcomePlacement, WELCOME_DURATION } from "@/lib/learning/welcome-motion";

const visit = createWelcomeVisitGuard(() => window.sessionStorage);

/** Decorative only: never takes focus, catches input, or locks scrolling. */
export function HomeWelcomeMotion({ active }: { active: boolean }) {
  const actorRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active || visit.hasSeen()) return;
    const actor = actorRef.current;
    const shell = actor?.closest(".learning-chat-shell");
    const dock = shell?.querySelector<HTMLElement>(".brand-mark");
    const hero = shell?.querySelector<HTMLElement>(".home-hero");
    const title = shell?.querySelector<HTMLElement>(".home-welcome-title");
    if (!actor || !dock || !hero || !title) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || !actor.animate || document.visibilityState !== "visible") {
      visit.markSeen();
      return;
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const animations: Animation[] = [];
    const previousVisibility = dock.style.visibility;
    const finish = () => {
      stopped = true;
      actor.hidden = true;
      actor.removeAttribute("data-playing");
      dock.style.visibility = previousVisibility;
      animations.forEach(animation => animation.cancel());
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      events.forEach(event => window.removeEventListener(event, interrupt, true));
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", interrupt);
    };
    const interrupt = () => { visit.markSeen(); finish(); };
    const onVisibility = () => { if (document.visibilityState !== "visible") interrupt(); };
    // Capture without cancelling the original event: the user's first tap works.
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "resize", "pagehide", "scroll"] as const;
    events.forEach(event => window.addEventListener(event, interrupt, { capture: true, passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", interrupt);

    const images = Array.from(actor.querySelectorAll("img"));
    Promise.all(images.map(image => image.decode())).then(() => {
      if (stopped) return;
      frame = requestAnimationFrame(() => {
        if (stopped) return;
        const range = document.createRange();
        range.selectNodeContents(title);
        const placement = welcomePlacement(hero.getBoundingClientRect(), range.getBoundingClientRect(), dock.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
        if (!placement) { interrupt(); return; }
        visit.markSeen();
        actor.style.width = `${placement.size}px`;
        actor.style.height = `${placement.size}px`;
        actor.hidden = false;
        actor.dataset.playing = "true";
        dock.style.visibility = "hidden";
        const motion = actor.animate(welcomeKeyframes(placement), { duration: WELCOME_DURATION, easing: "linear", fill: "both" });
        animations.push(motion);
        // Smile during the nod, then return to the identical idle pose for docking.
        // Keep the idle body opaque underneath: fading both full sprites would
        // wash the navy silhouette out halfway through the expression change.
        animations.push(images[1].animate([0, 0, 1, 1, 0, 0].map((opacity, i) => ({ opacity, offset: [0, .18, .28, .57, .8, 1][i] })), { duration: WELCOME_DURATION, fill: "both" }));
        motion.onfinish = finish;
        timer = setTimeout(finish, WELCOME_DURATION + 150);
      });
    }).catch(finish); // Broken/slow assets must not remove the regular logo.
    return () => {
      finish();
      events.forEach(event => window.removeEventListener(event, interrupt, true));
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", interrupt);
    };
  }, [active]);

  return <span ref={actorRef} className="home-welcome-actor" aria-hidden="true" hidden>
    <img src="/brand/comma-idle.webp" alt="" width={192} height={192} draggable={false}/>
    <img src="/brand/comma-ready.webp" alt="" width={192} height={192} draggable={false}/>
  </span>;
}
