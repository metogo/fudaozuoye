import type { LearningSession } from "./types";
import type { ProviderAdapter } from "./providers/provider-contract";
import { mergePreparedAnswer } from "./session-preparation";

/** A visual preview may start prose, but must never authorize a learning gate. */
export function prepareFirstTurn(session: LearningSession, adapter: ProviderAdapter, image?: string) {
  let publish!: (value: LearningSession) => void;
  let fail!: (error: unknown) => void;
  const ready = image ? new Promise<LearningSession>((resolve, reject) => { publish = resolve; fail = reject; }) : Promise.resolve(session);
  let completion: Promise<{ ok: true; value: LearningSession } | { ok: false; error: unknown }> | undefined;
  // Text-only teaching already has validated evidence. Give its first token the
  // exclusive model-request window; visual evidence must still be audited first.
  const start = () => completion ??= adapter.completeChatSession(session, image, image ? visualContext => {
    publish({ ...session, problem: session.problem.userRevised ? session.problem : { ...session.problem, visualContext } });
  } : undefined).then(value => {
    if (image) publish(mergePreparedAnswer(session, value));
    return value;
  }).then(
    value => ({ ok: true as const, value }),
    (error: unknown) => {
      if (image) { fail(error); adapter.cancelPendingRequests(); }
      return { ok: false as const, error };
    },
  );
  if (image) start();
  return { ready, start, get completion() { return start(); } };
}
