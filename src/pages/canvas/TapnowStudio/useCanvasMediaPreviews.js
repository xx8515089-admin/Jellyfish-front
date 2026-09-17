import { stableMediaNodes } from './canvasConnections'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { StudioCanvases } from '../../../services/studioCanvases'
import { applyPreviewUpdates, clearDisconnectedPreviewMedia, connectedPreviewLinks, loadPreviewMedia, stablePreviewLinks } from './canvasMediaPreview'

export function useCanvasMediaPreviews({ session, enabled, nodes, connections, tasks, setNodes, report }) {
  const latest = useRef({ nodes, connections, tasks, setNodes, report })
  latest.current = { nodes, connections, tasks, setNodes, report }
  const mediaGraph = useRef([])
  const mediaNodes = useMemo(() => stableMediaNodes(nodes, mediaGraph.current), [nodes])
  useLayoutEffect(() => { mediaGraph.current = mediaNodes }, [mediaNodes])
  const previousGraph = useRef({ nodes: mediaNodes, connections })
  useLayoutEffect(() => {
    const before = previousGraph.current
    previousGraph.current = { nodes: mediaNodes, connections }
    const cleaned = clearDisconnectedPreviewMedia(mediaNodes, connections, before.nodes, before.connections)
    if (cleaned !== mediaNodes) latest.current.setNodes(current => clearDisconnectedPreviewMedia(current, connections, before.nodes, before.connections))
  }, [mediaNodes, connections])
  const outputCache = useMemo(() => new Map(), [session])
  const links = useMemo(() => connectedPreviewLinks(mediaNodes, connections), [mediaNodes, connections])
  const previousLinks = useRef([])
  const stableLinks = useMemo(() => stablePreviewLinks(links, previousLinks.current), [links])
  useLayoutEffect(() => { previousLinks.current = stableLinks }, [stableLinks])
  const completedKey = useMemo(() => JSON.stringify(tasks.filter(task => task.status === 3).map(task => [task.generationId, task.nodeId, task.outputs])), [tasks])

  useEffect(() => {
    let cancelled = false
    const links = connectedPreviewLinks(latest.current.nodes, latest.current.connections)
    const requests = new Map()
    const updates = []
    let scheduled = false
    const enqueue = update => {
      updates.push(update)
      if (scheduled) return
      scheduled = true
      queueMicrotask(() => {
        scheduled = false
        const batch = updates.splice(0)
        if (cancelled) return
        const current = latest.current
        // Do not dispatch an unchanged value. Even a functional no-op can cause
        // another render/effect pass when other canvas effects also set state.
        if (applyPreviewUpdates(current.nodes, current.connections, batch) === current.nodes) return
        current.setNodes(previous => cancelled ? previous : applyPreviewUpdates(previous, latest.current.connections, batch))
      })
    }
    for (const link of links) {
      // Applied media belongs to the current canvas and can flow through its
      // wires even while cloud saving/recovery is paused or in local mode.
      if (link.media) {
        enqueue({ ...link, result: link.media })
        continue
      }
      // Only recovering an absent result needs an active cloud session.
      if (!session || !enabled || !link.recoverTask) continue
      if (!requests.has(link.sourceId)) {
        requests.set(link.sourceId, loadPreviewMedia(link, {
          session, tasks: latest.current.tasks, listGenerations: StudioCanvases.generations, outputCache,
        }))
      }
      void requests.get(link.sourceId).then(result => {
        if (cancelled || !result) return
        enqueue({ ...link, result })
      }).catch(error => { if (!cancelled) latest.current.report(error) })
    }
    return () => { cancelled = true }
  }, [session, enabled, stableLinks, completedKey, outputCache])
}
