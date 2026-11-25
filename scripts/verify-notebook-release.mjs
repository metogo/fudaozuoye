import { randomUUID } from "node:crypto";
import { models } from "../cuotiben/shared/models.js";

export async function verifyNotebookRelease(apiBase, origin, request = fetch) {
  const url = apiBase.replace(/\/$/, "") + "/notebook";
  const catalog = await request(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!catalog.ok) throw new Error("线上错题本目录读取失败（HTTP " + catalog.status + "）");
  const { models: available } = await catalog.json();
  const missing = models.filter(model => !available?.some(option => option.id === model.id));
  if (missing.length) throw new Error("错题本缺少旧版可选模型：" + missing.map(model => model.name).join("、"));

  const deviceId = randomUUID();
  for (const model of ["doubao", models[0].id]) {
    const response = await request(url, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ model, q: "有6本书，又收到7本，一共有几本？用阿拉伯数字回答。", child: "", entryId: randomUUID(), deviceId }),
      signal: AbortSignal.timeout(125000),
    });
    if (!response.ok) throw new Error(model + " 错题本真实解析失败（HTTP " + response.status + "）");
    const result = await response.json();
    const provider = model === "doubao" ? "doubao" : "requesty";
    if (result.provider !== provider || !result.modelId || (provider === "requesty" && result.modelId !== model) ||
      !/13|十三/.test(result.answer) || !result.hint?.trim() || !result.check?.trim() || !result.steps?.length) {
      throw new Error(model + " 错题本未返回完整、正确的讲解");
    }
  }
}
