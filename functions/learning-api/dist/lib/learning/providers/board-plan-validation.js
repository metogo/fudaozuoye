"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNativeSceneSet = assertNativeSceneSet;
function assertNativeSceneSet(scenes, context, profile) {
    if (scenes.length < 2 || scenes.length > 6)
        throw new Error("新版板书必须包含 2 到 6 个职责完整的教学单元");
    const roles = scenes.map((scene) => scene.role);
    for (const required of ["orient", "reason"])
        if (!roles.includes(required))
            throw new Error(`新版板书缺少 ${required} 教学职责`);
    if (new Set(roles).size !== roles.length)
        throw new Error("新版板书教学职责不能重复");
    const moveIndexes = scenes.map((scene) => profile.moves.findIndex((move) => move.id === scene.move));
    if (moveIndexes.some((index) => index < 0) || new Set(moveIndexes).size !== moveIndexes.length
        || moveIndexes.some((index, position) => position > 0 && index <= moveIndexes[position - 1]))
        throw new Error("新版板书教学动作必须按当前学科蓝图顺序出现且不能重复");
    assertDistinct(scenes.map((scene) => compact(scene.content)), "正文");
    assertDistinct(scenes.map((scene) => compact(scene.purpose ?? "")), "教学目的");
    assertDistinct(scenes.map((scene) => compact(scene.why ?? "")), "成立原因");
    assertDistinct(scenes.map((scene) => compact(scene.selfCheck ?? "")), "自查问题");
    for (const scene of scenes)
        for (const message of context) {
            if (copiesChatParagraph(scene.content, message.text) || copiesChatParagraph(scene.why ?? "", message.text))
                throw new Error("新版板书不能整段搬运 Chat 内容");
        }
}
function assertDistinct(values, label) {
    if (new Set(values).size !== values.length)
        throw new Error(`新版板书${label}不能重复`);
}
function copiesChatParagraph(candidate, source) {
    const normalizedCandidate = compact(candidate);
    const normalizedSource = compact(source);
    if (normalizedCandidate.length < 36 || normalizedSource.length < 36)
        return false;
    if (normalizedSource.includes(normalizedCandidate))
        return true;
    return candidate.split(/[。！？；\n]/).some((sentence) => compact(sentence).length >= 36 && normalizedSource.includes(compact(sentence)));
}
function compact(value) { return value.normalize("NFKC").replace(/[\s，。；：、“”‘’（）()\[\]【】]/g, "").toLowerCase(); }
