"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isStoredBoardLesson = exports.isStoredBoardCache = exports.BOARD_CACHE_VERSION = void 0;
exports.restoreBoardLesson = restoreBoardLesson;
const board_aids_1 = require("./board-aids");
const board_1 = require("./providers/board");
const board_cache_schema_1 = require("./board-cache-schema");
var board_cache_schema_2 = require("./board-cache-schema");
Object.defineProperty(exports, "BOARD_CACHE_VERSION", { enumerable: true, get: function () { return board_cache_schema_2.BOARD_CACHE_VERSION; } });
Object.defineProperty(exports, "isStoredBoardCache", { enumerable: true, get: function () { return board_cache_schema_2.isStoredBoardCache; } });
Object.defineProperty(exports, "isStoredBoardLesson", { enumerable: true, get: function () { return board_cache_schema_2.isStoredBoardLesson; } });
function restoreBoardLesson(session, value) {
    if (!(0, board_cache_schema_1.isStoredBoardLesson)(value))
        return null;
    // 缓存只证明用户曾打开板书；正文、计划和配图全部由当前权威引擎重建。
    // 这样既不信任旧模型内容，也不会把确定性原生正文误送进模型增强契约复检。
    const lesson = (0, board_1.createInstantBoardLesson)(session, session.flow.focus, { recommended: true, reason: "从当前题目重新生成学科原生板书。", layout: value.layout });
    if (lesson.quality)
        return null;
    return (0, board_aids_1.isBoardLessonSafeForRestore)(session, lesson) ? lesson : null;
}
