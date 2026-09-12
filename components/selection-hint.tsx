"use client";
import { useEffect, useState } from "react";
import { useUiText } from "./ui-language";
let shownInPage = false;
export function SelectionHint() {
  const t = useUiText();
  const [phase, setPhase] = useState<"hidden" | "visible" | "reserved">("hidden");
  useEffect(() => {
    // Preserve the anchor's layout while opening a quote. Collapsing this
    // space can clamp the page scroll and immediately dismiss the new editor.
    const hide = () => setPhase(current => current === "visible" ? "reserved" : current);
    const timer = setTimeout(() => {
      if (shownInPage) return;
      shownInPage = true;
      try { if (localStorage.getItem("learning-selection-hint-v1")) return; localStorage.setItem("learning-selection-hint-v1", "seen"); } catch { /* Once per page when storage is unavailable. */ }
      setPhase("visible");
    }, 0);
    window.addEventListener("learning-selection-used", hide);
    return () => { clearTimeout(timer); window.removeEventListener("learning-selection-used", hide); };
  }, []);
  return phase !== "hidden" ? <aside className="selection-discovery-hint" data-selection-exclude aria-hidden={phase === "reserved" || undefined} style={phase === "reserved" ? { visibility: "hidden" } : undefined}><span>{t("哪段没懂？轻点正文，选中后问小逗号。")}</span><button type="button" onClick={() => setPhase("hidden")} aria-label={t("关闭长按提问提示")}>×</button></aside> : null;
}
