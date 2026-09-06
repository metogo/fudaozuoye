import type { LearningTurnInput } from "./types";

export function isOptionalPracticeTurn(input: LearningTurnInput) {
  return input.type === "request_transfer" ||
    (input.type === "choose" && input.choice === "practice_similar");
}

export function turnIdleTimeout(input: LearningTurnInput) {
  if (input.type === "choose" && input.choice === "view_illustration") return 210_000;
  // Each optional server phase is bounded to 60 seconds. Let its recovery
  // response reach the client instead of aborting first at 45 seconds.
  return isOptionalPracticeTurn(input) ? 75_000 : 45_000;
}
