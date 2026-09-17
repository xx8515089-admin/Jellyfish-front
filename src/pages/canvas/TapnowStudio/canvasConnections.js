export function indexConnections(connections) {
  const incoming = new Map(), outgoing = new Map()
  for (const edge of connections) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, [])
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
    incoming.get(edge.to).push(edge)
    outgoing.get(edge.from).push(edge)
  }
  return { incoming, outgoing }
}

export function connectCanvasNodes(connections, nodesMap, edge) {
  const target = nodesMap.get(edge.to)
  if (!target || !nodesMap.has(edge.from)) return { connections, reason: '连接的节点已被删除' }
  if (edge.from === edge.to) return { connections, reason: '不能连接节点自身' }
  const port = edge.inputType || 'default'
  const existing = connections.find(item => item.from === edge.from && item.to === edge.to && (item.inputType || 'default') === port)
  const single = port !== 'default' || ['preview', 'input-image', 'video-analyze'].includes(target.type)
  if (existing) {
    if (!single) return { connections }
    const deduped = connections.filter(item => item === existing || item.to !== edge.to || (item.inputType || 'default') !== port)
    return { connections: deduped.length === connections.length ? connections : deduped }
  }
  const retained = single ? connections.filter(item => !(item.to === edge.to && (item.inputType || 'default') === port)) : connections
  const { outgoing } = indexConnections(retained)
  const visited = new Set(), pending = [edge.to]
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index]
    if (id === edge.from) return { connections, reason: '此连接会形成循环，请调整节点连接方向' }
    if (visited.has(id)) continue
    visited.add(id)
    for (const next of outgoing.get(id) || []) pending.push(next.to)
  }
  return { connections: [...retained, { ...edge, inputType: port === 'default' ? undefined : port }] }
}

// Dragging changes geometry, not media dependencies: retain the prior graph in that case.
export function stableMediaNodes(nodes, previous = []) {
  const byId = new Map(previous.map(node => [node.id, node]))
  const keys = ['type', 'content', 'settings', 'frames', 'selectedKeyframes', 'previewType', 'previewMjImages', 'previewFilename', 'previewSourceNodeId', 'videoMeta', 'videoMetaSource', 'videoFileName', 'title', 'extractingFrames']
  let changed = nodes.length !== previous.length
  const next = nodes.map((node, index) => {
    const prior = byId.get(node.id)
    const stable = prior && keys.every(key => prior[key] === node[key]) ? prior : node
    if (stable !== previous[index]) changed = true
    return stable
  })
  return changed ? next : previous
}
