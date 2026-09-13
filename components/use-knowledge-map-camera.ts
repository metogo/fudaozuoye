"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { ConceptNode } from "./knowledge-map-node";

/** Follow actual generation progress; camera motion never drives loading or selection. */
export function useKnowledgeMapCamera({ flow, canvas, target, complete, error, selected, interacted, recoverView }: {
  flow: ReactFlowInstance<ConceptNode> | null;
  canvas: RefObject<HTMLDivElement | null>;
  target?: Pick<ConceptNode, "id" | "position" | "measured">;
  complete: boolean;
  error: string;
  selected: string | null;
  interacted: RefObject<boolean>;
  recoverView: (animate?: boolean) => void;
}) {
  const previous = useRef("");
  const hasFramed = useRef(false);
  useEffect(() => {
    if (!flow || selected || interacted.current) return;
    const frame = () => {
      const element = canvas.current;
      if (interacted.current || !element?.clientWidth || !element.clientHeight) return;
      if (complete || error) {
        // Re-fit on final node measurements and window changes, without replaying
        // a generation animation when opening an already complete cached map.
        recoverView(hasFramed.current);
        hasFramed.current = true;
        return;
      }
      if (!target) return;
      const width = target.measured?.width ?? 194;
      const height = target.measured?.height ?? 160;
      const zoom = Math.max(.25, Math.min(1.35, (element.clientWidth - 64) / width, (element.clientHeight - 140) / height));
      const viewport = {
        x: element.clientWidth / 2 - (target.position.x + width / 2) * zoom,
        y: element.clientHeight / 2 + 12 - (target.position.y + height / 2) * zoom,
        zoom,
      };
      const signature = JSON.stringify([target.id, viewport]);
      if (signature === previous.current) return;
      previous.current = signature;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      void flow.setViewport(viewport, { duration: hasFramed.current && !reduced ? 650 : 0 });
      hasFramed.current = true;
    };
    const handle = requestAnimationFrame(frame);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(frame);
    if (canvas.current) observer?.observe(canvas.current);
    return () => { cancelAnimationFrame(handle); observer?.disconnect(); };
  }, [flow, canvas, target, complete, error, selected, interacted, recoverView]);
}
