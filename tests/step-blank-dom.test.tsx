// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/dynamic", () => ({ default: () => ({ onConfirm, onCancel, statusMessage }: any) => <div><button onClick={() => onConfirm(new Blob(["ink"]), "blob:ink")}>提交手写</button><button onClick={onCancel}>取消手写</button><span>{statusMessage}</span></div> }));
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: any) => <>{text}</> }));
import { StepBlank } from "@/components/step-blank";
const gate: any = { id: "g1", kind: "step_answer", prompt: "补全判别式", stepBlank: { before: "Δ", after: "≥ 0" }, stepAnswer: { answer: "b^2-4ac" } };
describe("StepBlank", () => { afterEach(cleanup);
 it("显示答案后可继续，并支持提示和键盘修订", () => { const hint = vi.fn(), cont = vi.fn(); render(<StepBlank gate={gate} busy={false} onHint={hint} onContinue={cont}/>); expect(screen.getByText("b^2-4ac")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "给我一点提示" })); expect(hint).toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "也可以用键盘填写 / 修改" })); fireEvent.change(screen.getByLabelText("修改填空答案"), { target: { value: "b²−4ac" } }); fireEvent.click(screen.getByRole("button", { name: "显示答案" })); expect(screen.getByText("b^2-4ac")).not.toBeNull(); fireEvent.click(screen.getByRole("button", { name: "看懂了，继续" })); expect(cont).toHaveBeenCalled(); });
 it("白板识别会回填答案，并给低置信度提示", async () => { const transcribe = vi.fn(async () => ({ text: "b^2-4ac", confidence: .5 })); const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined); render(<StepBlank gate={{ ...gate, stepAnswer: undefined }} busy={false} onHint={vi.fn()} onReveal={vi.fn()} onTranscribe={transcribe}/>); fireEvent.click(screen.getByRole("button", { name: "点击填写这个空" })); fireEvent.click(screen.getByRole("button", { name: "提交手写" })); await waitFor(() => expect(screen.getByText("识别可能有误，请核对或修改。")).not.toBeNull()); expect(transcribe).toHaveBeenCalledWith("g1", expect.any(Blob), expect.any(AbortSignal)); expect(revoke).toHaveBeenCalledWith("blob:ink"); revoke.mockRestore(); });
 it("空白、过长或失败的手写识别会保留当前填空，并可取消返回", async () => {
   const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
   const view = render(<StepBlank gate={{ ...gate, stepAnswer: undefined }} busy={false} onHint={vi.fn()} onReveal={vi.fn()} onTranscribe={vi.fn(async () => ({ text: "", confidence: 1 }))}/>);
   fireEvent.click(screen.getByRole("button", { name: "点击填写这个空" }));
   fireEvent.click(screen.getByRole("button", { name: "提交手写" }));
   await waitFor(() => expect(screen.getByText("没有识别清楚，请重写或用键盘填写")).not.toBeNull());
   fireEvent.click(screen.getByRole("button", { name: "取消手写" }));
   view.unmount();

   render(<StepBlank gate={{ ...gate, stepAnswer: undefined }} busy={false} onHint={vi.fn()} onReveal={vi.fn()} onTranscribe={vi.fn(async () => ({ text: "x".repeat(301), confidence: 1 }))}/>);
   fireEvent.click(screen.getByRole("button", { name: "点击填写这个空" }));
   fireEvent.click(screen.getByRole("button", { name: "提交手写" }));
   await waitFor(() => expect(screen.getByText("这一步只需要简短填写，请只写空格里的内容。")).not.toBeNull());
   revoke.mockRestore();
 });
 it("高置信度手写会收起白板并回填，未给答案时可以请求显示答案", async () => {
   const reveal = vi.fn();
   const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
   render(<StepBlank gate={{ ...gate, stepAnswer: undefined }} busy={false} onHint={vi.fn()} onReveal={reveal} onTranscribe={vi.fn(async () => ({ text: "b^2-4ac", confidence: .96 }))}/>);
   fireEvent.click(screen.getByRole("button", { name: "点击填写这个空" }));
   fireEvent.click(screen.getByRole("button", { name: "提交手写" }));
   await waitFor(() => expect(screen.getByRole("status").textContent).toContain("已回填，可以修改"));
   expect(screen.queryByText("提交手写")).toBeNull();
   expect(screen.getByRole("button", { name: "修改这个空的答案" }).textContent).toContain("b^2-4ac");
   fireEvent.click(screen.getByRole("button", { name: "显示答案" }));
   expect(reveal).toHaveBeenCalledTimes(1);
   revoke.mockRestore();
 });
});
