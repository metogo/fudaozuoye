// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SelectionHint } from "@/components/selection-hint";
afterEach(cleanup);
it("首次提示可关闭，重新挂载不反复出现，不提供新的选句按钮", async () => {
  localStorage.clear(); const view = render(<SelectionHint/>);
  const close = await screen.findByRole("button", { name: "关闭长按提问提示" });
  expect(screen.getByText("哪段没懂？轻点正文，选中后问小逗号。")).toBeTruthy();
  expect(localStorage.getItem("learning-selection-hint-v1")).toBe("seen");
  fireEvent.click(close); view.unmount(); render(<SelectionHint/>);
  expect(screen.queryByRole("button")).toBeNull();
});
