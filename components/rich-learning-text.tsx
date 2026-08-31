"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { prepareLearningMarkdown } from "@/lib/learning/presentation";

interface RichLearningTextProps {
  text: string;
  compact?: boolean;
  streaming?: boolean;
  autoMath?: boolean;
  trailing?: ReactNode;
}

const standardComponents: Components = {
  h1: ({ children }) => <h2 className="rich-heading rich-heading--primary">{children}</h2>,
  h2: ({ children }) => <h2 className="rich-heading rich-heading--primary">{children}</h2>,
  h3: ({ children }) => <h3 className="rich-heading rich-heading--secondary">{children}</h3>,
  p: ({ children }) => <p>{children}</p>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  code: ({ children, className }) => className
    ? <code className={className}>{children}</code>
    : <code>{children}</code>,
  pre: ({ children }) => <pre>{children}</pre>,
  hr: () => <hr/>,
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => <span className="rich-blocked-image">{alt ? `图片：${alt}` : "图片已隐藏"}</span>,
  span: ({ children, className, node, ...props }) => {
    void node;
    return <span {...props} className={className} tabIndex={className?.includes("math-display") || className?.includes("math-inline") ? 0 : props.tabIndex}>{children}</span>;
  },
};

const compactComponents: Components = {
  ...standardComponents,
  h1: ({ children }) => <strong>{children}</strong>,
  h2: ({ children }) => <strong>{children}</strong>,
  h3: ({ children }) => <strong>{children}</strong>,
  p: ({ children }) => <span>{children}</span>,
  ul: ({ children }) => <span>{children}</span>,
  ol: ({ children }) => <span>{children}</span>,
  li: ({ children }) => <span className="block">{children}</span>,
  blockquote: ({ children }) => <span>{children}</span>,
  pre: ({ children }) => <span>{children}</span>,
  hr: () => null,
};

export function RichLearningText({ text, compact = false, streaming = false, autoMath = true, trailing }: RichLearningTextProps) {
  const Root = compact ? "span" : "div";
  const content = autoMath ? prepareLearningMarkdown(text, streaming) : text;
  return <Root className={`rich-learning-text ${compact ? "rich-learning-text--compact" : ""} ${streaming ? "chat-streaming-text" : ""} ${trailing ? "rich-learning-text--with-trailing" : ""}`}>
    <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
      components={compact ? compactComponents : standardComponents}
    >
      {content}
    </ReactMarkdown>
    {trailing}
  </Root>;
}
