import type { KnowledgeConnection } from "@/lib/learning/knowledge-connection";
export const source = "先看每小时走多远，再看走了几小时。每小时走的距离都一样，把这几个小时的距离加起来，就知道一共走了多远。";
export const evidence = "小明每小时走3千米，走了2小时，一共走了多少千米？";
export const connection: KnowledgeConnection = {
  version: 1, anchor: source, evidence, kind: "prerequisite",
  foundation: { title: "相同数相加", explanation: "几份东西一样多，可以把每一份的数量加起来。", example: "每袋2个苹果，3袋就是2加2再加2。" },
  target: { title: "乘法的意义", explanation: "几个相同的数相加，可以用乘法写得更简洁。", example: "3袋苹果，每袋2个，可以写成3乘2。" },
  reason: "每小时走的距离相同，所以几个小时就有几个同样多的距离；先理解这样相加，才知道为什么可以用乘法。",
};
