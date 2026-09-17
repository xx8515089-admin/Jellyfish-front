const GAP_X = 150, GAP_Y = 60
const number = (value, fallback) => Number.isFinite(value) ? value : fallback
const size = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback
const rect = node => ({ x: number(node.x, 0), y: number(node.y, 0), width: size(node.width, 260), height: size(node.height, 200) })

export function nodesForArrangement(nodes, selectedIds = new Set(), selectedId) {
  const selected = nodes.filter(node => selectedIds?.has(node.id))
  if (selected.length) return selected
  const single = nodes.find(node => node.id === selectedId)
  return single ? [single] : nodes
}

export function arrangeCanvasNodes(nodes, connections, selectedIds, selectedId) {
  const targets = nodesForArrangement(nodes, selectedIds, selectedId)
  if (targets.length < 2) return { nodes, count: targets.length, changed: false }
  const graph = new Map(targets.map(node => [node.id, { node, ...rect(node), parents: new Set(), children: new Set(), level: 0 }]))
  for (const edge of connections) {
    if (edge.from === edge.to || !graph.has(edge.from) || !graph.has(edge.to)) continue
    graph.get(edge.from).children.add(edge.to)
    graph.get(edge.to).parents.add(edge.from)
  }
  const order = [...graph.values()].sort((a, b) => a.y - b.y || a.x - b.x || String(a.node.id).localeCompare(String(b.node.id)))
  const connected = order.filter(item => item.parents.size || item.children.size)
  const isolated = order.filter(item => !item.parents.size && !item.children.size)
  const pending = new Set(connected.map(item => item.node.id))
  const degree = new Map(connected.map(item => [item.node.id, item.parents.size]))
  const queue = connected.filter(item => !item.parents.size).map(item => item.node.id)
  let cursor = 0
  while (pending.size) {
    // Imported legacy cycles have no root. Break one incoming dependency for layout
    // only; every vertex is visited once and the actual wires stay untouched.
    if (cursor === queue.length) queue.push(pending.values().next().value)
    const id = queue[cursor++]
    if (!pending.delete(id)) continue
    const item = graph.get(id)
    for (const childId of item.children) {
      if (!pending.has(childId)) continue
      const child = graph.get(childId)
      child.level = Math.max(child.level, item.level + 1)
      degree.set(childId, degree.get(childId) - 1)
      if (degree.get(childId) === 0) queue.push(childId)
    }
  }
  const layers = []
  for (const item of connected) (layers[item.level] ||= []).push(item)
  const ranks = new Map()
  const rank = layer => layer.forEach((item, index) => ranks.set(item.node.id, index))
  layers.forEach(rank)
  // Fixed sweeps reduce crossing without enumerating paths through a branching DAG.
  for (let pass = 0; pass < 3; pass++) {
    for (const direction of [1, -1]) {
      const traversal = direction === 1 ? layers : [...layers].reverse()
      for (const layer of traversal) {
        const score = item => {
          const neighbors = [...(direction === 1 ? item.parents : item.children)].filter(id => direction * (graph.get(id).level - item.level) < 0)
          return neighbors.length ? neighbors.reduce((sum, id) => sum + ranks.get(id), 0) / neighbors.length : ranks.get(item.node.id)
        }
        const scores = new Map(layer.map(item => [item.node.id, score(item)]))
        layer.sort((a, b) => scores.get(a.node.id) - scores.get(b.node.id) || ranks.get(a.node.id) - ranks.get(b.node.id))
        rank(layer)
      }
    }
  }
  const startX = Math.min(...order.map(item => item.x)), startY = Math.min(...order.map(item => item.y))
  const positions = new Map()
  let x = startX, graphHeight = 0
  for (const layer of layers) {
    let y = startY, width = 0
    for (const item of layer) {
      positions.set(item.node.id, { x, y })
      y += item.height + GAP_Y
      width = Math.max(width, item.width)
    }
    graphHeight = Math.max(graphHeight, y - startY)
    x += width + GAP_X
  }
  // Independent nodes form a compact grid instead of one very tall column.
  const columns = Math.ceil(Math.sqrt(isolated.length))
  const cellWidth = Math.max(0, ...isolated.map(item => item.width)) + GAP_X
  const cellHeight = Math.max(0, ...isolated.map(item => item.height)) + GAP_Y
  isolated.forEach((item, index) => positions.set(item.node.id, {
    x: startX + (index % columns) * cellWidth,
    y: startY + graphHeight + Math.floor(index / columns) * cellHeight,
  }))
  const stationary = nodes.filter(node => !graph.has(node.id)).map(rect)
  const placed = []
  for (const [id, position] of positions) {
    const box = { ...graph.get(id), ...position }
    if (stationary.length) {
      const obstacles = [...stationary, ...placed]
      // Each collision moves strictly below that obstacle, so this always terminates.
      for (let attempt = 0; attempt <= obstacles.length; attempt++) {
        const collisions = obstacles.filter(other => box.x < other.x + other.width + GAP_Y && box.x + box.width + GAP_Y > other.x && box.y < other.y + other.height + GAP_Y && box.y + box.height + GAP_Y > other.y)
        if (!collisions.length) break
        box.y = Math.max(...collisions.map(other => other.y + other.height + GAP_Y))
      }
    }
    positions.set(id, { x: Math.round(box.x), y: Math.round(box.y) })
    placed.push(box)
  }
  let changed = false
  const next = nodes.map(node => {
    const position = positions.get(node.id)
    if (!position || (node.x === position.x && node.y === position.y)) return node
    changed = true
    return { ...node, ...position }
  })
  return { nodes: changed ? next : nodes, count: targets.length, changed }
}
