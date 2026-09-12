// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NodePractice } from "@/components/node-practice";
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <span>{text}</span> }));
const focus = { id: "core", title: "工作效率", summary: "", application: "", evidence: "6天" };
const props = { focus, map: { version: 1 as const, overviewOnly: true, rootId: "core", nodes: [focus], edges: [] }, stateToken: "signed", partial: true };
const practice = { question: "效率怎样变化？", options: ["翻倍", "减半", "不变"], correctIndex: 0, explanation: "时间减半效率翻倍", connection: "回到原题求合做效率" };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("按需出题、选择后核对、说明原题关联，刷新换题不跳出卡片", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ practice })));
  vi.stubGlobal("fetch", fetcher); render(<NodePractice {...props}/>);
  expect(fetcher).not.toHaveBeenCalled(); fireEvent.click(screen.getByText("练一道"));
  await screen.findByText(practice.question);
  expect(screen.getByText("核对思路").hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getAllByRole("radio")[0]); fireEvent.click(screen.getByText("核对思路"));
  expect(screen.getByText("这次选对了，看看依据")).toBeTruthy(); expect(screen.getByText(practice.connection)).toBeTruthy();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ practice: { ...practice, question: "新题" } })));
  fireEvent.click(screen.getByLabelText("换一道练习")); await screen.findByText("新题");
  expect(screen.queryByText(practice.explanation)).toBeNull();
  expect(JSON.parse(fetcher.mock.calls[1][1].body).previous).toEqual([practice.question]);
});
it("换题失败保留旧题和作答，关闭后晚到结果不串入下一次", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ practice }))).mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetcher); const view = render(<NodePractice {...props}/>);
  fireEvent.click(screen.getByText("练一道")); await screen.findByText(practice.question);
  fireEvent.click(screen.getAllByRole("radio")[1]); fireEvent.click(screen.getByLabelText("换一道练习"));
  await screen.findByRole("alert"); expect((screen.getAllByRole("radio")[1] as HTMLInputElement).checked).toBe(true);
  let resolve!: (value: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  fireEvent.click(screen.getByText("重试练习"));
  const signal = fetcher.mock.calls[2][1].signal;
  fireEvent.click(screen.getByText("收起练习")); expect(signal.aborted).toBe(true);
  await act(async () => resolve(new Response(JSON.stringify({ practice: { ...practice, question: "过期题" } }))));
  fireEvent.click(screen.getByText("继续这道练习")); expect(screen.queryByText("过期题")).toBeNull();
  view.unmount();
});
it("切换节点重置练习，失败支持局部重试", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(new Response(JSON.stringify({ practice })));
  vi.stubGlobal("fetch", fetcher); const view = render(<NodePractice key="a" {...props}/>);
  fireEvent.click(screen.getByText("练一道")); await screen.findByRole("alert");
  fireEvent.click(screen.getByText("重试练习")); await screen.findByText(practice.question);
  view.rerender(<NodePractice key="b" {...props} focus={{ ...focus, id: "other", title: "面积" }}/>);
  await waitFor(() => expect(screen.queryByText(practice.question)).toBeNull());
  expect(screen.getByText("练一道")).toBeTruthy();
});
