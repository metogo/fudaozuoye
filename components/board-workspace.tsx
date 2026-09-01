"use client";
import type { BoardConversationMessage, BoardDocument, BoardLesson, BoardScene, BoardTeachingRole, BoardTeachingSubject, BoardWorkspaceState } from "@/lib/learning/types";
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
  const visualCount = scenes.filter((scene) => scene.visual).length;

  return <div className="board-workspace board-course">
    <section className="board-workspace-hero board-course-hero">
      <div><p>{subjectLabel(lesson.plan?.subject)}</p><h2>{lesson.plan?.thesis ? "这页板书要讲清什么" : "完整板书"}</h2></div>
      <span>{scenes.length} 个教学单元{visualCount ? ` · ${visualCount} 处辅助` : ""}</span>
      <div className="board-course-thesis"><RichLearningText text={lesson.plan?.thesis ?? document.learningGoal}/></div>
      <div className="board-workspace-goal"><span>学完后你应该能够</span><RichLearningText text={document.learningGoal} compact/></div>
      {sourceMessages.length > 0 && <BoardSourceTrail label="板书依据" messages={sourceMessages.slice(-3)}/>}
    </section>

    <ol className="board-course-route" aria-label="本页板书脉络">
      {scenes.map((scene, index) => <li key={scene.id}><span>{String(index + 1).padStart(2, "0")}</span><div><small>{teachingRoleLabel(scene.role)}</small><strong>{scene.title}</strong></div></li>)}
    </ol>

    <div className="board-course-content">
      {scenes.map((scene, index) => {
        const node = document.nodes[index];
        if (!node) return null;
        const nodeState = boardNodeRecallState(state, node.id);
        const annotations = lesson.annotations.filter((annotation) => annotation.blockId === node.id);
        const sceneSources = sourceMessages.filter((message) => scene.sourceMessageIds.includes(message.id));
        const recalling = state.mode === "recall" && state.activeNodeId === node.id && !nodeState.revealed;
        return <section key={node.id} className={`board-workspace-node board-course-unit board-workspace-node--${scene.tone}`} aria-labelledby={`board-node-${node.id}`}>
          <header>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><p>{teachingRoleLabel(scene.role)}</p><h2 id={`board-node-${node.id}`}>{scene.title}</h2></div>
          </header>

          {scene.purpose && <div className="board-teaching-purpose"><span>这一块帮你</span><RichLearningText text={scene.purpose} compact/></div>}

          {recalling ? <div className="board-recall-mask board-recall-mask--inline">
            <span>主动回忆</span><h3>{scene.selfCheck ?? "试着复述这一步的依据和作用"}</h3><p>先不看原文，用自己的话说出关键关系。想好后再核对。</p>
            <button type="button" onClick={() => onChange({ ...state, mode: "overview", nodes: state.nodes.map((item) => item.nodeId === node.id ? { ...item, revealed: true } : item) })}>查看原板书</button>
          </div> : <>
            <div className="board-workspace-node__content"><MarkedBoardText content={scene.content} annotations={annotations}/></div>
            {scene.evidence && (index === 0 || scene.evidence !== scenes[index - 1]?.evidence) && <div className="board-teaching-evidence"><span>原题依据</span><RichLearningText text={scene.evidence} compact/></div>}
            {scene.visual && <BoardSceneVisual visual={scene.visual} purpose={scene.purpose}/>}
            {scene.why && <div className="board-teaching-why"><span>为什么成立</span><RichLearningText text={scene.why}/></div>}
            <AnnotationNotes annotations={annotations}/>
            {scene.selfCheck && <div className="board-teaching-check"><div><span>停一下，自查</span><RichLearningText text={scene.selfCheck} compact/></div><button type="button" onClick={() => onChange({ ...state, mode: "recall", activeNodeId: node.id, nodes: state.nodes.map((item) => item.nodeId === node.id ? { ...item, revealed: false } : item) })}>遮住这块复述</button></div>}
          </>}

          {sceneSources.length > 0 && <BoardSourceTrail label="这块承接" messages={sceneSources}/>}
        </section>;
      })}
    </div>
  </div>;
}

function teachingRoleLabel(role?: BoardTeachingRole): string {
  if (role === "orient") return "读懂任务";
  if (role === "model") return "建立关系";
  if (role === "reason") return "关键推导";
  if (role === "misconception") return "易错辨析";
  if (role === "transfer") return "方法迁移";
  if (role === "recap") return "一页记忆";
  return "板书讲解";
}

function subjectLabel(subject?: BoardTeachingSubject): string {
  if (subject === "math") return "数学 · 关系与推导";
  if (subject === "science") return "理科 · 对象与过程";
  if (subject === "language") return "语言 · 语境与证据";
  if (subject === "humanities") return "人文 · 材料与因果";
  return "独立学习板书";
}
