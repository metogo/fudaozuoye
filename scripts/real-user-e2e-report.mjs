export function renderSummary(summary, items) {
  return renderSummaryTemplate(summary, items)
    .replace("# 10 组真实模型用户旅程测试", `# ${summary.users} 组真实模型用户旅程测试`)
    .replace("- 关键步骤检查拒绝纯答案", `- 完整讲解达到详细结构标准：${summary.detailedFullSolutions}/${summary.fullSolutionJourneys}\n- 关键步骤检查拒绝纯答案`)
    .replace("- 完整讲解后三路径", `- 引导、追问与补救输出结构清晰：${summary.structuredTutorOutputs}/${summary.tutorOutputs}\n- 完整讲解后三路径`)
    .replace("- 完整讲解后三路径", `- 完整讲解结论与原题答案一致：${summary.alignedFullSolutions}/${summary.fullSolutionJourneys}\n- 完整讲解后三路径`)
    .replace("- 完整讲解后三路径", `- 猜你想问推荐：${summary.suggestionsOffered}/${summary.suggestionJourneys}，出现后点击并返回主线：${summary.suggestionsChosen}/${summary.suggestionsOffered}\n- 图片提问处理：${summary.imageQuestionsHandled}/${summary.imageQuestionJourneys}\n- 图片作答识别：${summary.imageAnswersHandled}/${summary.imageAnswerJourneys}\n- 完整讲解后板书：${summary.solutionBoardsValidated}/${summary.solutionBoardJourneys}\n- 完整讲解后三路径`)
    .replace("是 10 组自动化学生画像", `是 ${summary.users} 组自动化学生画像`);
}

function renderSummaryTemplate(summary, items) {
  const failures = items.filter((item) => item.status !== "passed");
  return `# 10 组真实模型用户旅程测试\n\n## 结果\n\n- 用户画像：${summary.users}\n- 题目旅程：${summary.journeys}\n- 完成：${summary.passed}\n- 失败：${summary.failed}\n- 功能完成率：${(summary.functionalCompletionRate * 100).toFixed(1)}%\n- 分学科完成率：${Object.entries(summary.subjectCompletionRates).map(([subject, rate]) => `${subject} ${(rate * 100).toFixed(1)}%`).join("、")}\n- 首次分析成功率：${(summary.firstTryAnalysisRate * 100).toFixed(1)}%\n- SSE 多段输出率：${(summary.printerLikeSseRate * 100).toFixed(1)}%\n- 推理强度锁定率：${(summary.modelLevelLockRate * 100).toFixed(1)}%\n- 板书审校通过：${summary.boardValidated}/${summary.boardOffered}\n- 迁移题完成：${summary.transferCompleted}/${summary.transferRequested}\n- 错答恢复有效：${summary.wrongAnswerFeedback}/${summary.wrongRecoveryJourneys}\n- 关键步骤检查拒绝纯答案：${summary.recallRejectedFinalAnswer}/${summary.fullSolutionJourneys}\n- 完整讲解后三路径：${Object.entries(summary.postSolutionPaths).map(([path, count]) => `${path} ${count}`).join("、")}\n- 暂时结束后恢复验证：${summary.reviewedResume}\n- 标准答案自动比对待复核：${summary.answerAlignmentReviewFlags}\n- 首段疑似答案泄露：${summary.earlyAnswerLeakCount}\n\n## 覆盖\n\n- 学科：${summary.coverage.subjects.join("、")}\n- 学段：${summary.coverage.gradeBands.join("、")}\n- 难度：${summary.coverage.difficulties.join("、")}\n- 推理强度：${summary.coverage.levels.join("、")}\n- 学习路线：${summary.coverage.routes.join("、")}\n\n## 失败旅程\n\n${failures.length ? failures.map((item) => `- ${item.userId} / ${item.problemId} / ${item.level}：${item.failure}`).join("\n") : "- 无"}\n\n> 本报告中的“用户”是 10 组自动化学生画像，调用真实模型和真实服务；不等同于 10 位真人参与者，也不能替代真人学习效果研究。\n`;
}
