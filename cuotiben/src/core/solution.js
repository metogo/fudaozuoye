// The service can put a Markdown heading on its own immediately before a numbered list.
export function readingSteps(parts) {
  const steps = [];
  let heading = '';
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    if (/^(?:#{1,6} +[^\n]+|(?:\*\*)?(?:分步推导|解题步骤|推导过程|详细步骤|解答过程|计算过程|证明过程)(?:\*\*)?[：:]?)$/u.test(text)) {
      heading = [heading, text].filter(Boolean).join('\n');
      continue;
    }
    steps.push(heading ? heading + '\n' + text : text);
    heading = '';
  }
  return steps;
}
