/** Scroll the actual ancestor under the pointer, never a sibling selected by CSS classes. */
export function scrollNodeWheel(event, canvas, getStyle = element => window.getComputedStyle(element)) {
  const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target
  const node = target?.closest?.('.node-wrapper')
  if (!node || !canvas?.contains(node)) return false
  const horizontal = event.shiftKey || Math.abs(event.deltaX || 0) > Math.abs(event.deltaY || 0)
  const delta = horizontal ? (event.deltaX || event.deltaY || 0) : (event.deltaY || 0)
  if (!delta) return false
  let hasScrollArea = false
  for (let element = target; element; element = element.parentElement) {
    const style = getStyle(element)
    const overflow = horizontal ? style.overflowX : style.overflowY
    const size = horizontal ? element.clientWidth : element.clientHeight
    const max = (horizontal ? element.scrollWidth : element.scrollHeight) - size
    if (/^(auto|scroll|overlay)$/.test(overflow) && max > 1) {
      hasScrollArea = true
      const key = horizontal ? 'scrollLeft' : 'scrollTop'
      const position = element[key]
      if ((delta > 0 && position < max - 1) || (delta < 0 && position > 0)) {
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size : 1
        element[key] = Math.max(0, Math.min(max, position + delta * unit))
        break
      }
    }
    if (element === node) break
  }
  if (hasScrollArea) {
    if (event.cancelable) event.preventDefault()
    event.stopPropagation()
  }
  // At the outer boundary keep the wheel inside the node rather than zooming the canvas.
  return hasScrollArea
}
