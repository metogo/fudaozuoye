"use client";
import { useEffect, useRef, useState } from "react";
import { boardStepDisplayCopy } from "@/lib/learning/board-step-copy";
import type { BoardConversationMessage, BoardDocument, BoardLesson, BoardScene, BoardWorkspaceState } from "@/lib/learning/types";
import { boardNodeRecallState } from "@/lib/learning/board-workspace";
import { AnnotationNotes, BoardSourceTrail, MarkedBoardText } from "./board-learning-content";
import { BoardSceneVisual } from "./board-scene-visual";
import { RichLearningText } from "./rich-learning-text";

interface BoardWorkspaceProps {
  document: BoardDocument;
  lesson: BoardLesson;
  sourceMessages: BoardConversationMessage[];
  state: BoardWorkspaceState;
  onChange: (next: BoardWorkspaceState) => void;
}

export function BoardWorkspace({ document, lesson, sourceMessages, state, onChange }: BoardWorkspaceProps) {
  const scenes: BoardScene[] = lesson.plan?.scenes ?? lesson.blocks.map((block, index) => ({
    id: block.id, title: block.label, content: block.content, tone: block.tone,
    intent: (["extract", "connect", "derive", "verify"] as const)[index] ?? "verify",
    sourceMessageIds: [] as string[], visual: null,
  }));
  const discipline = lesson.plan?.discipline;
  const stepSubject = discipline ?? lesson.plan?.subject;
  const sceneRoles = scenes.map((scene) => scene.role);
  const sceneCopies = scenes.map((scene, index) => boardStepDisplayCopy({ subject: stepSubject, role: scene.role, roles: sceneRoles, title: scene.title, index }));
  const { workspaceRef, routeRef, activeStep, pinned } = useBoardRouteTracking(scenes.map((scene) => scene.id).join("|"));

  return <div ref={workspaceRef} className={`board-workspace board-course${discipline ? ` board-course--${discipline}` : ""}`} data-discipline={discipline}>
    <nav ref={routeRef} className={`board-course-route-nav${pinned ? " board-course-route-nav--pinned" : ""}`} aria-label="本页板书步骤">
      <ol className="board-course-route">
        {scenes.map((scene, index) => <li key={scene.id} className={pinned && activeStep === index ? "is-active" : undefined} aria-current={pinned && activeStep === index ? "step" : undefined}>
          <span>{String(index + 1).padStart(2, "0")}</span><strong>{sceneCopies[index].eyebrow}</strong>
        </li>)}
      </ol>
    </nav>

    <div className="board-course-content">
      {scenes.map((scene, index) => {
        const node = document.nodes[index];
        if (!node) return null;
        const copy = sceneCopies[index];
        const nodeState = boardNodeRecallState(state, node.id);
        const annotations = lesson.annotations.filter((annotation) => annotation.blockId === node.id);
        const sceneSources = sourceMessages.filter((message) => scene.sourceMessageIds.includes(message.id));
        const recalling = state.mode === "recall" && state.activeNodeId === node.id && !nodeState.revealed;
        return <section key={node.id} data-board-step-index={index} className={`board-workspace-node board-course-unit board-workspace-node--${scene.tone}`} aria-labelledby={`board-node-${node.id}`}>
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><p>{copy.eyebrow}</p><h2 id={`board-node-${node.id}`}>{copy.title}</h2>{copy.title !== scene.title && <p className="board-course-unit__topic">本题这一步：{scene.title}</p>}</div>
          </header>

          {scene.purpose && <div className="board-teaching-purpose"><span>本步目标</span><RichLearningText text={scene.purpose} compact/></div>}

          {recalling ? <div className="board-recall-mask board-recall-mask--inline">
            <span>主动回忆</span><h3>{scene.selfCheck ?? "试着复述这一步的依据和作用"}</h3><p>先不看原文，用自己的话说出关键关系。想好后再核对。</p>
            <button type="button" onClick={() => onChange({ ...state, mode: "overview", nodes: state.nodes.map((item) => item.nodeId === node.id ? { ...item, revealed: true } : item) })}>查看原板书</button>
          </div> : <>
            <div className="board-workspace-node__content"><span>怎么做</span><MarkedBoardText content={scene.content} annotations={annotations}/></div>
            {scene.evidence && <div className="board-teaching-evidence"><span>题目依据</span><RichLearningText text={scene.evidence} compact/></div>}
            {scene.visual && <BoardSceneVisual visual={scene.visual} purpose={scene.purpose}/>}
            {scene.why && <div className="board-teaching-why"><span>为什么</span><RichLearningText text={scene.why}/></div>}
            <AnnotationNotes annotations={annotations}/>
            {scene.selfCheck && <div className="board-teaching-check"><div><span>自己检查</span><RichLearningText text={scene.selfCheck} compact/></div><button type="button" onClick={() => onChange({ ...state, mode: "recall", activeNodeId: node.id, nodes: state.nodes.map((item) => item.nodeId === node.id ? { ...item, revealed: false } : item) })}>遮住后复述</button></div>}
          </>}

          {sceneSources.length > 0 && <BoardSourceTrail label="这块承接" messages={sceneSources}/>}
        </section>;
      })}
    </div>
  </div>;
}

function useBoardRouteTracking(sceneKey: string) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLElement>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const workspace = workspaceRef.current;
    const route = routeRef.current;
    const scrollArea = workspace?.closest<HTMLElement>(".board-scroll");
    if (!workspace || !route || !scrollArea) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rootTop = scrollArea.getBoundingClientRect().top;
      const routeRect = route.getBoundingClientRect();
      const nextPinned = routeRect.top <= rootTop + 1 && scrollArea.scrollTop > 0;
      const focusLine = rootTop + (nextPinned ? routeRect.height : 0) + 16;
      const steps = Array.from(workspace.querySelectorAll<HTMLElement>("[data-board-step-index]"));
      let nextStep = 0;
      for (const step of steps) if (step.getBoundingClientRect().top <= focusLine) nextStep = Number(step.dataset.boardStepIndex ?? 0);
      if (scrollArea.scrollHeight - scrollArea.scrollTop - scrollArea.clientHeight < 2) nextStep = Math.max(0, steps.length - 1);
      setPinned((current) => current === nextPinned ? current : nextPinned);
      setActiveStep((current) => current === nextStep ? current : nextStep);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    scrollArea.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      scrollArea.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sceneKey]);

  return { workspaceRef, routeRef, activeStep, pinned };
}
