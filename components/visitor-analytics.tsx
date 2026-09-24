"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ANALYTICS_CHOICE_KEY, canResetLocalAnalytics, readAnalyticsChoice, VisitorAnalytics, type AnalyticsChoice, type AnalyticsStatus, type AnalyticsSurface } from "@/lib/visitor-analytics";
import styles from "./visitor-analytics.module.css";
import { useUiText } from "./ui-language";

export function VisitorAnalyticsSettings({ surface }: { surface: AnalyticsSurface }) {
  const t = useUiText();
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [status, setStatus] = useState<AnalyticsStatus>("off");
  const [restored, setRestored] = useState(false);
  const [resetError, setResetError] = useState(false);
  const resetAvailable = restored && canResetLocalAnalytics(window.location.hostname, process.env.NODE_ENV);
  const promptOpen = restored && choice === null && surface === "home";
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement | null>(null);
  const tracker = useRef<VisitorAnalytics | null>(null);
  const disclosure = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const analytics = new VisitorAnalytics(window, setStatus);
    tracker.current = analytics;
    const restore = () => {
      let next: AnalyticsChoice | null = null;
      try { next = readAnalyticsChoice(localStorage); }
      catch { setStorageError(true); }
      setChoice(next);
      setRestored(true);
      analytics.setAllowed(next === "accepted");
    };
    const timer = window.setTimeout(restore, 0);
    const sync = (event: StorageEvent) => { if (event.key === ANALYTICS_CHOICE_KEY || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); analytics.dispose(); tracker.current = null; };
  }, []);
  useEffect(() => { tracker.current?.setSurface(surface); }, [surface]);
  useEffect(() => {
    if (!promptOpen) return;
    const element = dialog.current;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, [promptOpen]);

  function choose(next: AnalyticsChoice) {
    setChoice(next);
    try { localStorage.setItem(ANALYTICS_CHOICE_KEY, next); setStorageError(false); }
    catch { setStorageError(true); }
    tracker.current?.setAllowed(next === "accepted");
    if (disclosure.current) disclosure.current.open = false;
  }
  function resetLocalChoice() {
    if (!resetAvailable) return;
    try { localStorage.removeItem(ANALYTICS_CHOICE_KEY); }
    catch { setResetError(true); return; }
    setResetError(false);
    tracker.current?.setAllowed(false);
    setChoice(null);
  }
  const actions = <div className={styles.actions}>
    <button type="button" onClick={() => choose("declined")}>{t("不启用统计")}</button>
    <button type="button" onClick={() => choose("accepted")}>{t("同意基础统计")}</button>
  </div>;
  const content = <div className={styles.description}>
      <h2 id={titleId} tabIndex={-1} autoFocus={promptOpen}>{t("一起让小逗号更好用")}</h2>
      <p className={styles.intro}>{t("允许基础访问统计，帮助我们了解哪些页面更常使用，把改进做在需要的地方。")}</p>
      <p className={styles.boundary}>{t("不向百度统计发送题目、照片、作答或对话正文。")}</p>
      <p>{t("同意后，百度统计会接收 IP 地址、浏览器与设备信息、页面访问记录和 Cookie 标识，用于统计访问人数、浏览量与来源。")}</p>
      <details className={`analytics-privacy-details ${styles.privacyDetails}`}>
        <summary>{t("查看统计范围与隐私说明")}</summary>
        <p>{t("来源只保留网站域名；页面只记录首页、对话和知识图谱类别。不开启点击热力图、全埋点或广告追踪。")}</p>
        <p>{t("可在页面下方的「访问统计与隐私设置」随时关闭，停止后续上报；不会删除百度已收到的历史数据。")}</p>
        <a href="https://tongji.baidu.com/web/help/article?id=330&type=0" target="_blank" rel="noopener noreferrer">{t("百度统计个人信息保护说明 ↗")}</a>
      </details>
      <p className={styles.choiceNote}>{t("由你选择，不启用也能正常解题。未满 14 周岁，请由监护人阅读并决定。")}</p>
      {!promptOpen && <p>{choice !== "accepted" ? t("当前：未启用") : status === "loading" ? t("当前：正在连接统计服务") : status === "error" ? t("统计服务暂不可用，不影响解题；可点击同意重试。") : status === "ready" ? t("当前：已启用") : t("当前环境不发送访问统计")}</p>}
      {storageError && <p>{t("浏览器无法保存统计偏好；下次访问会重新询问。")}</p>}
      {actions}
      </div>;
  return <aside className={`visitor-analytics ${styles.root}`} aria-label={t("访问统计设置")}>
    {promptOpen ? <dialog ref={dialog} className={`visitor-analytics-dialog ${styles.dialog}`} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); choose("declined"); }}>
      {content}
    </dialog> : <details ref={disclosure} className={styles.disclosure}>
      <summary>{t("访问统计与隐私设置")}</summary>
      {content}
    </details>}
    {resetAvailable && surface === "home" && !promptOpen && <button type="button" className={`analytics-reset-trigger ${styles.reset}`} onClick={resetLocalChoice}>{t("重置本地统计选择")}</button>}
    {resetError && <p>{t("无法重置统计选择，请检查浏览器存储权限。")}</p>}
  </aside>;
}
