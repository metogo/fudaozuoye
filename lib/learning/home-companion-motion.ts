const REST_MS = 18_000;
export interface HomeCompanionVisit { introduced: boolean }

/** Owns only local animations: no scroll locking, layout changes or model calls. */
export function animateHomeCompanion(root: HTMLElement, visit: HomeCompanionVisit) {
  const actor = root.querySelector<HTMLImageElement>(".home-companion__actor img");
  const letters = Array.from(root.querySelectorAll<HTMLElement>(".home-companion__letter"));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let visible = true;
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let animations: Animation[] = [];

  const typing = () => document.activeElement?.matches("input, textarea, select, [contenteditable='true']");
  const allowed = () => !disposed && ready && visible && !reduced.matches && document.visibilityState === "visible" && !typing();
  const settle = () => {
    animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
    animations = [];
    delete root.dataset.interacting;
  };
  const revealSpeech = (animate = false) => {
    if (!disposed && root.dataset.speech === "waiting") root.dataset.speech = animate ? "appearing" : "ready";
  };
  if (visit.introduced || reduced.matches || !actor?.animate) revealSpeech();
  const schedule = (delay = visit.introduced ? REST_MS : 450) => {
    clearTimeout(timer);
    if (allowed()) timer = setTimeout(() => play(!visit.introduced), delay);
  };
  const finish = () => { settle(); revealSpeech(); schedule(); };
  const whisper = () => {
    settle();
    if (!allowed() || !actor || root.dataset.speech !== "waiting") { finish(); return; }
    root.dataset.interacting = "whisper";
    // Wind up, follow a short arc through one full turn, then absorb the landing.
    const gesture = actor.animate([
      { transform: "translate(0,0) rotate(0deg) scale(1)", offset: 0 },
      { transform: "translate(2px,3px) rotate(-16deg) scale(1.08,.89)", offset: .17, easing: "ease-out" },
      { transform: "translate(-8px,-16px) rotate(75deg) scale(1)", offset: .36 },
      { transform: "translate(-17px,-23px) rotate(185deg) scale(1)", offset: .52 },
      { transform: "translate(-11px,-13px) rotate(290deg) scale(1)", offset: .69, easing: "ease-in" },
      { transform: "translate(0,2px) rotate(360deg) scale(1.08,.92)", offset: .84, easing: "ease-out" },
      { transform: "translate(0,0) rotate(360deg) scale(1)", offset: 1 },
    ], { duration: 940, easing: "linear" });
    animations.push(gesture);
    gesture.onfinish = () => {
      settle();
      const eyelids = root.querySelector<HTMLElement>(".home-companion__eyelids");
      if (!allowed() || !eyelids?.animate) { finish(); return; }
      root.dataset.interacting = "blink";
      try {
        const open = "100% 0%, 100% 0%";
        const closed = "100% 50%, 100% 43%";
        const blink = eyelids.animate([
          { backgroundSize: open },
          { backgroundSize: closed, offset: .25 },
          { backgroundSize: closed, offset: .42 },
          { backgroundSize: open, offset: .75 },
          { backgroundSize: open },
        ], { duration: 300, iterations: 2, easing: "ease-in-out" });
        animations.push(blink);
        blink.onfinish = () => { revealSpeech(true); finish(); };
      } catch { finish(); }
    };
  };
  const play = (intro = false) => {
    if (!allowed() || !actor?.animate || animations.length) return;
    clearTimeout(timer);
    root.dataset.interacting = intro ? "introduce" : "nudge";
    visit.introduced = true;
    const duration = intro ? 2200 : 1500;
    try {
      const actorRect = actor.getBoundingClientRect();
      const nameRect = letters[letters.length - 1]?.getBoundingClientRect();
      // The WebP has transparent margins. Move the visible body up to the name,
      // regardless of the available space on a phone or a wider browser.
      const travel = nameRect ? Math.max(12, actorRect.left + actorRect.width * .14 - nameRect.right - 5) : 16;
      const movement = actor.animate([
        { transform: "translateX(0) rotate(0deg)", offset: 0 },
        { transform: `translateX(-${travel}px) rotate(-9deg)`, offset: .22 },
        { transform: `translateX(-${travel + 3}px) rotate(-6deg)`, offset: .43 },
        { transform: "translateX(3px) rotate(3deg)", offset: .72 },
        { transform: "translateX(0) rotate(0deg)", offset: 1 },
      ], { duration, easing: "cubic-bezier(.3,0,.2,1)" });
      animations.push(movement);
      // The character touches the right edge first; its push travels right to left.
      letters.forEach((letter, index) => {
        animations.push(letter.animate(intro ? [
          { opacity: 0, transform: "translateX(16px)" },
          { opacity: 1, transform: "translateX(-3px)", offset: .65 },
          { opacity: 1, transform: "translateX(0)" },
        ] : [
          { transform: "translateX(0) translateY(0)" },
          { transform: "translateX(-3px) translateY(-2px)", offset: .4 },
          { transform: "translateX(0) translateY(0)" },
        ], { duration: intro ? 700 : 600, delay: 350 + (letters.length - 1 - index) * 100, fill: "backwards", easing: "cubic-bezier(.22,.8,.25,1)" }));
      });
      movement.onfinish = () => {
        try { if (intro) whisper(); else finish(); }
        catch { finish(); }
      };
    } catch { finish(); } // Unsupported animations must leave the whole name readable.
  };
  const pause = () => {
    clearTimeout(timer);
    if (visit.introduced || reduced.matches || typing()) revealSpeech();
    settle();
  };
  const onVisibility = () => { pause(); schedule(); };
  const onFocus = () => { if (typing()) pause(); };
  const onBlur = () => { pause(); schedule(); }; // focusout precedes activeElement changing.
  const onActivity = () => { pause(); schedule(); };
  const onMotionPreference = () => { pause(); schedule(); };
  const onClick = (event: Event) => {
    if ((event.target as Element).closest("[data-companion-replay]")) play(false);
  };
  const onFocusOut = () => { clearTimeout(timer); timer = setTimeout(onBlur, 0); };
  root.addEventListener("click", onClick);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocusOut);
  window.addEventListener("wheel", onActivity, { passive: true });
  window.addEventListener("touchstart", onActivity, { passive: true });
  reduced.addEventListener("change", onMotionPreference);
  const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= .65;
    pause(); schedule(visit.introduced ? REST_MS : 450);
  }, { threshold: .65 });
  observer?.observe(root);
  const loaded = actor?.decode ? actor.decode() : Promise.resolve();
  loaded.then(() => { if (!disposed) { ready = true; schedule(visit.introduced ? REST_MS : 450); } }).catch(() => revealSpeech());

  return () => {
    disposed = true;
    pause();
    observer?.disconnect();
    root.removeEventListener("click", onClick);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onFocusOut);
    window.removeEventListener("wheel", onActivity);
    window.removeEventListener("touchstart", onActivity);
    reduced.removeEventListener("change", onMotionPreference);
  };
}
