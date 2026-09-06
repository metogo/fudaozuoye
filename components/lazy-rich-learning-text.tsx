"use client";

import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from "react";

// The empty homepage doesn't need Markdown/KaTeX. Start fetching as soon as a
// conversation begins, in parallel with the model rather than after its reply.
export const preloadLearningText = () => import("./rich-learning-text");
const Renderer = lazy(() => preloadLearningText().then((module) => ({ default: module.RichLearningText })));
class RendererBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
export function RichLearningText(props: ComponentProps<typeof import("./rich-learning-text").RichLearningText>) {
  // A slow/failed optional chunk must not hide the lesson or block its controls.
  const fallback = <span className="whitespace-pre-wrap">{props.text}{props.trailing}</span>;
  return <RendererBoundary fallback={fallback}><Suspense fallback={fallback}><Renderer {...props}/></Suspense></RendererBoundary>;
}
