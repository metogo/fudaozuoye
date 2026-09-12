"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareFirstTurn = prepareFirstTurn;
const session_preparation_1 = require("./session-preparation");
/** A visual preview may start prose, but must never authorize a learning gate. */
function prepareFirstTurn(session, adapter, image) {
    let publish;
    let fail;
    const ready = image ? new Promise((resolve, reject) => { publish = resolve; fail = reject; }) : Promise.resolve(session);
    let completion;
    // Text-only teaching already has validated evidence. Give its first token the
    // exclusive model-request window; visual evidence must still be audited first.
    const start = () => completion ??= adapter.completeChatSession(session, image, image ? visualContext => {
        publish({ ...session, problem: session.problem.userRevised ? session.problem : { ...session.problem, visualContext } });
    } : undefined).then(value => {
        if (image)
            publish((0, session_preparation_1.mergePreparedAnswer)(session, value));
        return value;
    }).then(value => ({ ok: true, value }), (error) => {
        if (image) {
            fail(error);
            adapter.cancelPendingRequests();
        }
        return { ok: false, error };
    });
    if (image)
        start();
    return { ready, start, get completion() { return start(); } };
}
