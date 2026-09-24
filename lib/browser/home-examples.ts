/** Self-contained examples: no missing diagrams, external assets or pre-generated answers. */
export const homeExamples = [
  {
    id: "primary-perimeter", stage: "小学", grade: "三年级", subject: "数学", topic: "长方形周长",
    question: "一个长方形长8厘米，宽3厘米。它的周长是多少厘米？",
  },
  {
    id: "primary-personification", stage: "小学", grade: "三年级", subject: "语文", topic: "拟人修辞",
    question: "“小溪一路唱着歌，奔向远方。”这句话用了什么修辞手法？请结合句中的词语说明理由。",
  },
  {
    id: "primary-present-tense", stage: "小学", grade: "五年级", subject: "英语", topic: "一般现在时",
    question: "选择正确答案并说明理由：My sister ___ to school every day. A. go  B. goes  C. going",
  },
  {
    id: "junior-equation", stage: "初中", grade: "七年级", subject: "数学", topic: "一元一次方程",
    question: "解方程 3(x - 2) + 4 = 2x + 7。",
  },
  {
    id: "junior-classical-chinese", stage: "初中", grade: "七年级", subject: "语文", topic: "文言文理解",
    question: "翻译“学而不思则罔，思而不学则殆”，并说说这句话强调了学习与思考怎样的关系。",
  },
  {
    id: "junior-present-continuous", stage: "初中", grade: "七年级", subject: "英语", topic: "现在进行时",
    question: "选择正确答案并说明理由：Look! The students ___ books in the classroom. A. read  B. are reading  C. reads",
  },
  {
    id: "senior-function", stage: "高中", grade: "高一", subject: "数学", topic: "函数最值",
    question: "已知函数 f(x) = x² - 4x + 5，定义域为 [0, 3]。求函数的最小值，并说明此时 x 的值。",
  },
  {
    id: "senior-classical-meaning", stage: "高中", grade: "高一", subject: "语文", topic: "文言词义与句式",
    question: "“师者，所以传道受业解惑也”中的“所以”是什么意思？请翻译全句，并判断句式。",
  },
  {
    id: "senior-relative-clause", stage: "高中", grade: "高一", subject: "英语", topic: "定语从句",
    question: "选择正确答案并说明理由：The book ___ I borrowed yesterday is interesting. A. that  B. who  C. where",
  },
].map(example => ({ ...example, problem: `${example.stage}${example.grade}${example.subject}示例题：${example.question}` }));
