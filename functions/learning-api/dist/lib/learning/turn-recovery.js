"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOptionalPracticeTurn = isOptionalPracticeTurn;
exports.turnIdleTimeout = turnIdleTimeout;
function isOptionalPracticeTurn(input) {
    return input.type === "request_transfer" ||
        (input.type === "choose" && input.choice === "practice_similar");
}
function turnIdleTimeout(input) {
    if (input.type === "choose" && input.choice === "view_illustration")
        return 210_000;
    // Each optional server phase is bounded to 60 seconds. Let its recovery
    // response reach the client instead of aborting first at 45 seconds.
    return isOptionalPracticeTurn(input) ? 75_000 : 45_000;
}
