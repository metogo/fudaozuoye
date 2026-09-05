"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.illustrationFingerprint = void 0;
exports.createMockIllustrationLesson = createMockIllustrationLesson;
const teaching_compiler_1 = require("./teaching-compiler");
var illustration_fingerprint_1 = require("../illustration-fingerprint");
Object.defineProperty(exports, "illustrationFingerprint", { enumerable: true, get: function () { return illustration_fingerprint_1.illustrationFingerprint; } });
/** Mock and live modes share the same mathematical compiler and rendering contract. */
function createMockIllustrationLesson(session) {
    return (0, teaching_compiler_1.assembleTeachingLesson)(session, (0, teaching_compiler_1.compileTeachingProgram)(session));
}
