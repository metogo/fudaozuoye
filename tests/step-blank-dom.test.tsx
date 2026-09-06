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
});
