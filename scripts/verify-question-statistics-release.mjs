/** Read-only release check: never increase the production counter during testing. */
export async function verifyQuestionStatistics(apiBase, request = fetch) {
  const response = await request(`${apiBase.replace(/\/$/, "")}/learning/statistics`, {
    cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`线上解题统计未就绪（HTTP ${response.status}），停止前端发布`);
  const data = await response.json();
  if (!Number.isSafeInteger(data?.total) || data.total < 0) throw new Error("线上解题统计返回无效，停止前端发布");
  return data.total;
}
