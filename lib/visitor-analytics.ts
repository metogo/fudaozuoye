// Public site signature, not a credential. Never pass learning content to this module.
export const BAIDU_SITE_ID = "ebe5a892f1ae0fbeb7c52f31cf05c4cd";
export const ANALYTICS_CHOICE_KEY = "visitor-analytics-consent-v1";
export const ANALYTICS_PATHS = { home: "/", chat: "/visit/chat", map: "/visit/knowledge-map" } as const;
export type AnalyticsSurface = keyof typeof ANALYTICS_PATHS;
export type AnalyticsChoice = "accepted" | "declined";
export type AnalyticsStatus = "off" | "loading" | "ready" | "error";
type Command = [string, ...unknown[]];
declare global { interface Window { _hmt?: { push: (...commands: Command[]) => unknown }; } }

export function isAnalyticsHost(hostname: string): boolean {
  return hostname === "fudaozuoye.com" || hostname === "www.fudaozuoye.com";
}

export function canResetLocalAnalytics(hostname: string, mode: string | undefined): boolean {
  return mode === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

export function readAnalyticsChoice(storage: Pick<Storage, "getItem">): AnalyticsChoice | null {
  const value = storage.getItem(ANALYTICS_CHOICE_KEY);
  return value === "accepted" || value === "declined" ? value : null;
}

export function safeReferrer(referrer: string): string {
  if (!referrer) return "";
  try { const url = new URL(referrer); return /^https?:$/.test(url.protocol) ? url.origin + "/" : ""; }
  catch { return ""; } // Invalid referrers are deliberately excluded, never forwarded raw.
}

/** One instance per mounted application. No retries, no model/API dependencies. */
export class VisitorAnalytics {
  private allowed = false;
  private surface: AnalyticsSurface = "home";
  private previousPath: string | null = null;
  private script: HTMLScriptElement | null = null;
  private timer: number | undefined;
  private status: AnalyticsStatus = "off";
  constructor(private readonly win: Window, private readonly notify: (status: AnalyticsStatus) => void) {}

  setSurface(surface: AnalyticsSurface) {
    if (!Object.hasOwn(ANALYTICS_PATHS, surface)) return;
    this.surface = surface;
    this.track();
  }

  setAllowed(allowed: boolean) {
    this.allowed = allowed && isAnalyticsHost(this.win.location.hostname);
    if (!this.allowed) {
      this.command(["_setAutoTracking", false]);
      this.command(["_setAutoEventTracking", false]);
      this.previousPath = null;
      this.setStatus("off");
      return;
    }
    if (this.sdkReady()) {
      if (!this.command(["_setAutoTracking", true])) return;
      this.setStatus("ready");
      this.track();
    } else if (!this.script) this.load();
  }

  dispose() {
    this.setAllowed(false);
    this.clearLoad();
  }

  private sdkReady() {
    return Boolean(this.win._hmt && this.win._hmt.push !== Array.prototype.push);
  }

  private command(command: Command) {
    try { this.win._hmt?.push(command); return true; }
    catch { this.setStatus("error"); return false; } // Analytics failure must never interrupt a lesson.
  }

  private setStatus(status: AnalyticsStatus) { this.status = status; this.notify(status); }

  private clearLoad() {
    this.win.clearTimeout(this.timer);
    if (this.script) { this.script.onload = null; this.script.onerror = null; this.script.remove(); }
    this.script = null;
  }

  private load() {
    this.setStatus("loading");
    this.win._hmt = [] as Command[];
    this.command(["_setAutoPageview", false]);
    this.command(["_setAutoEventTracking", false]);
    // Keep automatic transmission off until initialization has completed with consent intact.
    this.command(["_setAutoTracking", false]);
    this.command(["_setReferrerOverride", safeReferrer(this.win.document.referrer)]);
    const script = this.win.document.createElement("script");
    this.script = script;
    script.id = "baidu-visitor-analytics";
    script.async = true;
    script.referrerPolicy = "origin";
    script.src = `https://hm.baidu.com/hm.js?${BAIDU_SITE_ID}`;
    const fail = () => {
      this.command(["_setAutoTracking", false]);
      this.clearLoad();
      this.setStatus(this.allowed ? "error" : "off");
    };
    script.onerror = fail;
    script.onload = () => {
      this.win.clearTimeout(this.timer);
      if (!this.sdkReady()) { fail(); return; } // A 200 with an empty script is not success.
      if (!this.command(["_setAutoTracking", this.allowed])) return;
      this.setStatus(this.allowed ? "ready" : "off");
      this.track();
    };
    this.timer = this.win.setTimeout(fail, 8000);
    this.win.document.head.appendChild(script);
  }

  private track() {
    const path = ANALYTICS_PATHS[this.surface];
    if (!this.allowed || this.status !== "ready" || path === this.previousPath) return;
    this.command(["_setReferrerOverride", this.previousPath
      ? this.win.location.origin + this.previousPath : safeReferrer(this.win.document.referrer)]);
    this.command(["_trackPageview", path]);
    if (this.status === "ready") this.previousPath = path;
  }
}
