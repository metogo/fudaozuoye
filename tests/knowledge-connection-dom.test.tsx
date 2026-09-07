// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { KnowledgeConnection } from "@/components/knowledge-connection";
import { connection } from "./fixtures/knowledge-connection";
vi.mock("@/components/lazy-rich-learning-text", () => ({ RichLearningText: ({ text }: { text: string }) => <>{text}</> }));
afterEach(cleanup);
it("默认直接解释关系；点击只就地展开，不强制打开完整图谱", () => {
  const open = vi.fn();
  render(<KnowledgeConnection connection={connection} onOpen={open}/>);
  expect(screen.getByText(connection.reason)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: connection.foundation.title }));
  expect(screen.getByRole("region", { name: `${connection.foundation.title}的就地讲解` })).not.toBeNull();
  expect(screen.getByText(connection.foundation.explanation)).not.toBeNull();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "在完整图谱中查看 →" }));
  expect(open).toHaveBeenCalledWith({ title: connection.foundation.title });
  fireEvent.click(screen.getByRole("button", { name: connection.target.title }));
  expect(screen.queryByRole("region", { name: `${connection.foundation.title}的就地讲解` })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: connection.target.title }));
  expect(screen.queryByRole("region")).toBeNull();
});
