// Keep gesture completion in capture phase: media controls may stop bubbling.
export function bindCanvasPointerEvents(target, getHandlers) {
  let frame = null, pending = null, suppressClick = false
  const clearMove = () => {
    if (frame !== null) target.cancelAnimationFrame(frame)
    frame = null; pending = null
  }
  const cancel = () => {
    clearMove()
    const h = getHandlers()
    if (!h.active) return
    try { h.end() } finally { h.cancel() }
  }
  const move = event => {
    const h = getHandlers()
    if (!h.active) return
    if (!h.connecting) { h.move(event); return }
    // A release outside the window must not leave a wire attached to the cursor.
    if (event.pointerType === 'mouse' && event.buttons === 0) { cancel(); return }
    pending = { clientX: event.clientX, clientY: event.clientY, movementX: event.movementX ?? 0, movementY: event.movementY ?? 0 }
    if (frame !== null) return
    frame = target.requestAnimationFrame(() => {
      frame = null
      const next = pending; pending = null
      const latest = getHandlers()
      if (latest.connecting && next) latest.move(next)
    })
  }
  const release = event => {
    const h = getHandlers()
    if (!h.active) return
    clearMove()
    if (!h.connecting) { h.end(); return }
    suppressClick = true
    event.preventDefault()
    event.stopPropagation()
    try {
      // Hit testing also handles implicit pointer capture on touch devices.
      const hit = target.document.elementFromPoint(event.clientX, event.clientY)
      const canvas = h.canvas
      if (hit && canvas?.contains(hit)) {
        const node = hit.closest('[data-node-id]')
        if (node) h.connect(node.dataset.nodeId, event, hit.closest('[data-input-type]')?.dataset.inputType || 'default')
        else h.background(event)
      }
    } catch (error) {
      h.report(error)
    } finally {
      try { h.end() } finally { h.cancel() }
    }
  }
  const keydown = event => {
    if (event.key !== 'Escape' || !getHandlers().active) return
    event.preventDefault()
    cancel()
  }
  // pointerup is followed by compatibility mouseup/click; consume only this gesture.
  const compatibility = event => {
    if (!suppressClick || event.detail === 0) return
    event.preventDefault(); event.stopPropagation()
  }
  const down = () => { suppressClick = false }
  const listeners = { pointermove: move, pointerup: release, pointercancel: cancel, blur: cancel, keydown, pointerdown: down, mouseup: compatibility, click: compatibility }
  for (const [name, handler] of Object.entries(listeners)) target.addEventListener(name, handler, true)
  return () => {
    clearMove()
    for (const [name, handler] of Object.entries(listeners)) target.removeEventListener(name, handler, true)
  }
}
