"use client";

import "katex/dist/katex.min.css";
import { memo, useMemo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { prepareMathForDisplay } from "@/lib/learning/math-quality";
import { rehypeReadableMath } from "@/lib/learning/rehype-readable-math";
import { remarkLearningEmphasis } from "@/lib/learning/remark-learning-emphasis";
import type { LearningEmphasis } from "@/lib/learning/learning-emphasis";

interface RichLearningTextProps {
  emphasis?: LearningEmphasis[];
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

export const RichLearningText = memo(function RichLearningText({ text, compact = false, streaming = false, autoMath = true, trailing, emphasis }: RichLearningTextProps) {
  const Root = compact ? "span" : "div";
  const { content, issues } = useMemo(() => autoMath ? prepareMathForDisplay(text, streaming) : { content: text, issues: [] }, [autoMath, text, streaming]);
  // A plain arithmetic display can use the interface's bold numeral face.
  // Never alter KaTeX metrics for symbolic expressions or unfinished streams.
  const displays = compact || streaming ? [] : [...content.matchAll(/\$\$([\s\S]*?)\$\$/g)];
  const arithmeticDisplays = displays.length > 0 && displays.every(([, source]) => {
    const arithmetic = source.replace(/\\text\{[^{}\\]{1,12}\}/g, "").replace(/\\(?:times|div|cdot)\b/g, "*");
    return /\d/.test(arithmetic) && /^[\d\s+\-−×÷*=.,():（）]+$/.test(arithmetic);
  });
  return <Root data-arithmetic-displays={arithmeticDisplays || undefined} className={`rich-learning-text ${compact ? "rich-learning-text--compact" : ""} ${streaming ? "chat-streaming-text" : ""} ${trailing ? "rich-learning-text--with-trailing" : ""}`}>
    <MarkdownBody content={content} compact={compact} emphasis={streaming ? undefined : emphasis}/>
    {issues.length > 0 && (compact
      ? <span className="math-format-note" title={issues.join(" ")}>（公式写法需核对）</span>
      : <details className="math-format-note"><summary>公式写法需核对</summary>{issues.map((issue) => <p key={issue}>{issue}</p>)}</details>)}
    {trailing}
  </Root>;
});

// Indicator/clipboard state must not reparse unchanged Markdown and formulas.
const MarkdownBody = memo(function MarkdownBody({ content, compact, emphasis }: { content: string; compact: boolean; emphasis?: LearningEmphasis[] }) {
  return <ReactMarkdown
      skipHtml
      remarkPlugins={[remarkMath, [remarkLearningEmphasis, { source: content, marks: emphasis ?? [] }]]}
      rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false, trust: false, maxExpand: 200, maxSize: 20 }], rehypeReadableMath]}
      components={compact ? compactComponents : standardComponents}
    >
      {content}
    </ReactMarkdown>;
});
