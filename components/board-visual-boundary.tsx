"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import type { BoardSemanticVisual } from "@/lib/learning/types";
import { BoardSceneVisual } from "./board-scene-visual";

interface Props { visual: BoardSemanticVisual; fallbackText: string; primary?: boolean; purpose?: string }
interface State { failed: boolean }

export class BoardVisualBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("板书专用介质渲染失败，已恢复为可读正文", error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.failed && previous.visual !== this.props.visual) this.setState({ failed: false });
  }

  render(): ReactNode {
    if (this.state.failed) return <p role="status" className="board-visual-fallback">图示暂时无法显示，请查看下方文字说明。</p>;
    return <BoardSceneVisual visual={this.props.visual} primary={this.props.primary} purpose={this.props.purpose}/>;
  }
}
