"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.animateHomeCompanion = animateHomeCompanion;
const INTRO_KEY = "home-comma-push-introduced-v1";
const REST_MS = 18_000;
/** Owns only local animations: no scroll locking, layout changes or model calls. */
function animateHomeCompanion(root) {
    const actor = root.querySelector(".home-companion__actor");
    const letters = Array.from(root.querySelectorAll(".home-companion__letter"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let visible = true;
    let ready = false;
    let introduced = false;
    let timer;
    let finishTimer;
    let animations = [];
    try {
        introduced = window.sessionStorage.getItem(INTRO_KEY) === "1";
    }
    catch { /* Private browsing still gets a local introduction. */ }
    const typing = () => document.activeElement?.matches("input, textarea, select, [contenteditable='true']");
    const allowed = () => !disposed && ready && visible && !reduced.matches && document.visibilityState === "visible" && !typing();
    const settle = () => {
        clearTimeout(finishTimer);
        animations.forEach(animation => animation.cancel());
        animations = [];
        delete root.dataset.interacting;
    };
    const schedule = (delay = REST_MS) => {
        clearTimeout(timer);
        if (allowed())
            timer = setTimeout(() => play(!introduced), delay);
    };
    const play = (intro = false) => {
        if (!allowed() || !actor?.animate || animations.length)
            return;
        clearTimeout(timer);
        root.dataset.interacting = intro ? "introduce" : "nudge";
        introduced = true;
        try {
            window.sessionStorage.setItem(INTRO_KEY, "1");
        }
        catch { /* Nonessential preference. */ }
        const duration = intro ? 2200 : 1500;
        try {
            const actorRect = actor.getBoundingClientRect();
            const nameRect = letters[letters.length - 1]?.getBoundingClientRect();
            // The WebP has transparent margins. Move the visible body up to the name,
            // regardless of the available space on a phone or a wider browser.
            const travel = nameRect ? Math.max(12, actorRect.left + actorRect.width * .14 - nameRect.right - 5) : 16;
            animations.push(actor.animate([
                { transform: "translateX(0) rotate(0deg)", offset: 0 },
                { transform: `translateX(-${travel}px) rotate(-9deg)`, offset: .22 },
                { transform: `translateX(-${travel + 3}px) rotate(-6deg)`, offset: .43 },
                { transform: "translateX(3px) rotate(3deg)", offset: .72 },
                { transform: "translateX(0) rotate(0deg)", offset: 1 },
            ], { duration, easing: "cubic-bezier(.3,0,.2,1)" }));
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
            finishTimer = setTimeout(() => { settle(); schedule(); }, duration);
        }
        catch {
            settle();
        } // Unsupported animations must leave the whole name readable.
    };
    const pause = () => { clearTimeout(timer); settle(); };
    const onVisibility = () => { pause(); schedule(); };
    const onFocus = () => { if (typing())
        pause(); };
    const onBlur = () => { pause(); schedule(); }; // focusout precedes activeElement changing.
    const onActivity = () => { pause(); schedule(); };
    const onMotionPreference = () => { pause(); schedule(); };
    const onClick = (event) => {
        if (event.target.closest("[data-companion-replay]"))
            play(false);
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
        pause();
        schedule(introduced ? REST_MS : 450);
    }, { threshold: .65 });
    observer?.observe(root);
    const image = actor?.querySelector("img");
    const loaded = image?.decode ? image.decode() : Promise.resolve();
    loaded.then(() => { if (!disposed) {
        ready = true;
        schedule(introduced ? REST_MS : 450);
    } }).catch(() => { });
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
