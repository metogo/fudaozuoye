"use client";
import { useEffect, useState } from "react";
import { useUiText } from "./ui-language";
let shownInPage = false;
export function SelectionHint() {
  const t = useUiText();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const hide = () => setVisible(false);
    const timer = setTimeout(() => {
      if (shownInPage) return;
      shownInPage = true;
      try { if (localStorage.getItem("learning-selection-hint-v1")) return; localStorage.setItem("learning-selection-hint-v1", "seen"); } catch { /* Once per page when storage is unavailable. */ }
      setVisible(true);
    }, 0);
    window.addEventListener("learning-selection-used", hide);
    return () => { clearTimeout(timer); window.removeEventListener("learning-selection-used", hide); };
  }, []);
  return visible ? <aside className="selection-discovery-hint" data-selection-exclude><span>{t("哪段没懂？轻点正文，选中后问小逗号。")}</span><button type="button" onClick={() => setVisible(false)} aria-label={t("关闭长按提问提示")}>×</button></aside> : null;
}
