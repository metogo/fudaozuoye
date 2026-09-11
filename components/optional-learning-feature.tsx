"use client";

import { Component, Suspense, lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { useUiText } from "./ui-language";

export const optionalFeatureTimeoutMs = 15000;

function FeatureStatus({ label, retry }: { label: string; retry?: () => void }) {
  const t = useUiText();
  return <section data-selection-exclude className="optional-feature-status mx-auto my-3 w-full max-w-2xl rounded-2xl border border-emerald-900/10 bg-emerald-50/50 p-4 text-sm text-emerald-950" role={retry ? "alert" : "status"}>
    <p>{t(retry ? "{feature}暂时不可用" : "正在加载{feature}…", { feature: t(label) })}</p>
    {retry && <><p className="mt-1 text-xs text-stone-500">{t("不影响当前解题，可以继续讲解或稍后重试。")}</p><button type="button" onClick={retry} className="optional-feature-retry mt-2 min-h-11 rounded-xl border border-emerald-900/15 px-4 text-xs">{t("重试{feature}", { feature: t(label) })}</button></>}
  </section>;
}

/** 每个可选功能独立隔离；重试创建新的 lazy 实例，避免复用 React 缓存的拒绝结果。 */
export function createOptionalLearningFeature<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, label: string, loading: ReactNode = <FeatureStatus label={label}/>) {
  const createAttempt = () => lazy(() => new Promise<{ default: ComponentType<P> }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("OPTIONAL_FEATURE_LOAD_TIMEOUT")), optionalFeatureTimeoutMs);
    // 同步异常、加载拒绝和超时全部交由本功能的边界处理，不伪造成功。
    Promise.resolve().then(load).then(
      module => { clearTimeout(timer); resolve(module); },
      error => { clearTimeout(timer); reject(error); },
    );
  }));
  return class OptionalLearningFeature extends Component<P, { failed: boolean; View: LazyExoticComponent<ComponentType<P>> }> {
    state = { failed: false, View: createAttempt() };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch() { console.warn("OPTIONAL_LEARNING_FEATURE_FAILED", label); }
    retry = () => this.setState({ failed: false, View: createAttempt() });
    render() {
      if (this.state.failed) return <FeatureStatus label={label} retry={this.retry}/>;
      const View = this.state.View;
      return <Suspense fallback={loading}><View {...this.props}/></Suspense>;
    }
  };
}
