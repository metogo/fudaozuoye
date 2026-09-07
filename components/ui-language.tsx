"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translateUi, UI_LOCALE_KEY, type UiLocale } from "@/lib/ui-copy";

type UiText = (source: string, values?: Record<string, string | number>) => string;
const UiLanguage = createContext<{ locale: UiLocale; t: UiText; change: (locale: UiLocale) => void }>({
  locale: "zh", t: (source, values) => translateUi("zh", source, values), change: () => {},
});

export function UiLanguageProvider({ children }: { children: React.ReactNode }) {
  // Match the server on hydration, then restore the explicitly chosen UI language.
  const [locale, setLocale] = useState<UiLocale>("zh");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const change = useCallback((next: UiLocale) => {
    setLocale(next);
    try { localStorage.setItem(UI_LOCALE_KEY, next); setStorageUnavailable(false); }
    catch { setStorageUnavailable(true); }
  }, []);
  useEffect(() => {
    const restore = () => {
      try { setLocale(localStorage.getItem(UI_LOCALE_KEY) === "en" ? "en" : "zh"); }
      catch { setStorageUnavailable(true); }
    };
    const timer = setTimeout(restore, 0);
    const sync = (event: StorageEvent) => { if (event.key === UI_LOCALE_KEY || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => { clearTimeout(timer); window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.title = translateUi(locale, "专注作业 持续理解");
  }, [locale]);
  const value = useMemo(() => ({ locale, change, t: (source: string, values?: Record<string, string | number>) => translateUi(locale, source, values) }), [locale, change]);
  return <UiLanguage.Provider value={value}>{children}{storageUnavailable && <p className="ui-language-storage fixed bottom-2 left-1/2 z-[100] max-w-[90vw] -translate-x-1/2 rounded-xl bg-stone-900 px-3 py-2 text-xs text-white" role="status">{locale === "zh" ? "无法保存语言偏好，本次切换仍然有效。" : "Language changed for this visit, but could not be saved."}</p>}</UiLanguage.Provider>;
}

export function useUiText(): UiText { return useContext(UiLanguage).t; }

export function UiLanguageSwitch() {
  const { locale, change } = useContext(UiLanguage);
  return <div className="ui-language-switch flex shrink-0 items-center rounded-full border border-stone-200 bg-white/80 p-0.5" role="group" aria-label={locale === "zh" ? "界面语言" : "Interface language"}>
    {(["zh", "en"] as const).map(code => <button key={code} type="button" lang={code === "zh" ? "zh-CN" : "en"} aria-pressed={locale === code} aria-label={code === "zh" ? "中文界面" : "English interface"} onClick={() => change(code)} className={`ui-language-option min-h-9 min-w-9 rounded-full px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${locale === code ? "bg-emerald-800 text-white" : "text-stone-500 hover:bg-stone-100"}`}>{code === "zh" ? "中" : "EN"}</button>)}
  </div>;
}
