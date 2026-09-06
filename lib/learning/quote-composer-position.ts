export function quoteComposerPosition(input: { viewportLeft: number; viewportTop: number; viewportWidth: number; viewportHeight: number; dockLeft: number; dockWidth: number; anchorBottom: number; height: number }) {
  const width = Math.min(520, input.dockWidth - 16, input.viewportWidth - 24);
  const left = Math.max(input.viewportLeft + 12, Math.min(input.viewportLeft + input.viewportWidth - width - 12, input.dockLeft + (input.dockWidth - width) / 2));
  const top = Math.max(input.viewportTop + 12, Math.min(input.anchorBottom + 18, input.viewportTop + input.viewportHeight - input.height - 12));
  return { left, top, width };
}
