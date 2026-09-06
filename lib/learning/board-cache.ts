import type { BoardLesson, LearningSession } from "./types";
import { isBoardLessonSafeForRestore } from "./board-aids";
import { createInstantBoardLesson } from "./providers/board";
import { isStoredBoardLesson } from "./board-cache-schema";
export { BOARD_CACHE_VERSION, isStoredBoardCache, isStoredBoardLesson, type StoredBoardCache } from "./board-cache-schema";

export function restoreBoardLesson(session: LearningSession, value: unknown): BoardLesson | null {
  if (!isStoredBoardLesson(value)) return null;
  // 缓存只证明用户曾打开板书；正文、计划和配图全部由当前权威引擎重建。
  // 这样既不信任旧模型内容，也不会把确定性原生正文误送进模型增强契约复检。
  const lesson = createInstantBoardLesson(session, session.flow.focus, { recommended: true, reason: "从当前题目重新生成学科原生板书。", layout: value.layout });
  if (lesson.quality) return null;
  return isBoardLessonSafeForRestore(session, lesson) ? lesson : null;
}
