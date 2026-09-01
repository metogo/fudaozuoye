"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

export class BoardErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("板书界面加载失败", error.message, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section role="alert" className="fixed inset-0 z-50 grid place-items-center bg-[#f1f2ea] p-6 text-stone-900"><div className="w-full max-w-sm rounded-3xl border border-stone-900/10 bg-white p-6 shadow-xl"><h2 className="text-base font-bold">板书暂时没有加载出来</h2><p className="mt-2 text-xs leading-6 text-stone-500">学习进度仍然保留。可以重试板书，或先回到当前学习主线。</p><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => this.setState({ failed: false })} className="min-h-11 rounded-xl bg-emerald-950 text-xs font-semibold text-white">重试板书</button><button type="button" onClick={this.props.onClose} className="min-h-11 rounded-xl border border-stone-900/10 text-xs font-semibold">回到主线</button></div></div></section>;
  }
}
