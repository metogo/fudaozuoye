import katex from "katex";

export function assertValidLatex(value: string, label: string) {
  for (const formula of value.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)) {
    const source = formula[1] ?? formula[2] ?? "";
    try {
      katex.renderToString(source, { throwOnError: true, strict: "error" });
    } catch {
      throw new Error(`${label}的 LaTeX 结构不合法`);
    }
  }
}
