// Shared by explanations and graph descriptions: correctness includes the scope of a rule.
export const teachingAccuracyInstruction = [
  "学科术语、规则适用条件必须准确。区分本题成立与普遍成立，不把一个词、一个数值或一个例子的规律泛化成通用口诀；易错提醒同样需要核对适用范围。",
  "英语中 every day 是时间状语短语，不是频度副词，不能脱离整句语境仅凭它断定时态。反例：She went to school every day last year. 也含 every day，但使用一般过去时。不要输出‘看到 every day 就用一般现在时’、‘every day 能确认时态’或追问‘哪个词决定时态’；应结合整句的时间语境、所表达的习惯和选项解释本题，而不是把提示当充分条件。",
  "提问时区分单词、短语和句子：多个单词构成的短语应问‘哪个短语’，不能问‘哪一个单词’。go 的第三人称单数是 goes，但不能把所有第三人称单数动词都说成加 -es，应区分一般加 -s、特殊词尾和不规则变化。",
  "不确定的术语分类或额外口诀不要输出，保留有依据的本题解释。",
].join("\n");
