const interactiveSelector = 'input, textarea, select, button, a, label, summary, video[controls], audio[controls], [contenteditable="true"], [role="combobox"], [role="slider"], [role="button"], [role="listbox"], [data-canvas-interactive]'
export function isCanvasInteractiveTarget(target) {
  return Boolean(target?.isContentEditable || target?.closest?.(interactiveSelector))
}
