import type { LearningSession } from "../types";
import { assembleTeachingLesson, compileTeachingProgram } from "./teaching-compiler";

export { illustrationFingerprint } from "../illustration-fingerprint";

/** Mock and live modes share the same mathematical compiler and rendering contract. */
export function createMockIllustrationLesson(session: LearningSession) {
  return assembleTeachingLesson(session, compileTeachingProgram(session));
}
