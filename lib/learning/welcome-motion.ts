export const WELCOME_STORAGE_KEY = "learning:welcome:nod:v1";
export const WELCOME_DURATION = 2100;

type Rect = { left: number; top: number; width: number; height: number };
export function welcomePlacement(hero: Rect, title: Rect, dock: Rect, viewport: { width: number; height: number }) {
  const right = Math.min(hero.left + hero.width, viewport.width - 20);
  const besideTitle = right - (title.left + title.width) - 12;
  const compact = besideTitle < 64;
  // The raster includes transparent breathing room; size the visible character,
  // not just its canvas, so it has the presence shown in the selected storyboard.
  const size = compact ? 64 : Math.min(120, besideTitle * 1.2);
  // Preserve large text/zoom layouts: never cover the copy to force a greeting.
  if (hero.width < 128 || dock.width <= 0 || dock.top < 0) return null;
  const x = compact ? right - size : Math.max(title.left + title.width + 12, right - size * .88);
  // On narrow phones, greet beside “Hey” above the title, without moving text.
  const y = compact ? title.top - size - 8 : title.top + title.height / 2 - size / 2 - 24;
  if (y < dock.top + dock.height + 12 || y + size > viewport.height) return null;
  return { x, y, size, dockX: dock.left, dockY: dock.top, scale: dock.width / size };
}

export function welcomeKeyframes(p: NonNullable<ReturnType<typeof welcomePlacement>>): Keyframe[] {
  const transform = (x: number, y: number, scale: number, angle = 0) => `translate3d(${x}px, ${y}px, 0) scale(${scale}) rotate(${angle}deg)`;
  return [
    { offset: 0, opacity: 0, transform: transform(p.x, p.y + 4, .94) },
    { offset: .14, opacity: 1, transform: transform(p.x, p.y, 1) },
    { offset: .3, opacity: 1, transform: transform(p.x + 2, p.y + 7, 1, 7) },
    { offset: .45, opacity: 1, transform: transform(p.x, p.y, 1) },
    { offset: .57, opacity: 1, transform: transform(p.x, p.y, 1) },
    // Cross the gap below the header, then approach the logo from underneath.
    // Flying across the header itself would cover the product's name.
    { offset: .77, opacity: 1, transform: transform(p.dockX + (p.x - p.dockX) * .62, p.dockY + p.size * p.scale + 14, p.scale + .2, -5) },
    { offset: .9, opacity: 1, transform: transform(p.dockX + 26, p.dockY + p.size * p.scale + 8, p.scale + .05) },
    { offset: 1, opacity: 1, transform: transform(p.dockX, p.dockY, p.scale) },
  ].map(frame => ({ ...frame, easing: "cubic-bezier(.22,.68,.32,1)" }));
}

/** Memory fallback keeps storage-disabled browsers usable and non-repeating. */
export function createWelcomeVisitGuard(getStorage: () => Pick<Storage, "getItem" | "setItem">) {
  let seen = false;
  return {
    hasSeen() {
      if (seen) return true;
      try { return getStorage().getItem(WELCOME_STORAGE_KEY) === "1"; } catch { return false; }
    },
    markSeen() {
      seen = true;
      try { getStorage().setItem(WELCOME_STORAGE_KEY, "1"); } catch { /* Optional enhancement, never block the app. */ }
    },
  };
}
