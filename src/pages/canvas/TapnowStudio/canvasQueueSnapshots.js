// Dialogs do not block generation. Keep their actions scoped to the exact
// queue entries / generation attempts that the user originally saw.
export function removeQueuedSnapshot(queue, snapshotItems) {
    const targets = new Set((snapshotItems || []).map(item => item.queueItem || item));
    if (targets.size === 0) return queue;
    const remaining = queue.filter(item => !targets.has(item));
    return remaining.length === queue.length ? queue : remaining;
}

export function stopRunningSnapshot(nodes, snapshotItems, now = Date.now()) {
    const targets = new Map();
    for (const item of snapshotItems || []) {
        if (!targets.has(item.nodeId)) targets.set(item.nodeId, new Map());
        targets.get(item.nodeId).set(String(item.shotId), item);
    }
    if (targets.size === 0) return nodes;

    let changed = false;
    const updatedNodes = nodes.map(node => {
        const nodeTargets = targets.get(node.id);
        if (node.type !== 'storyboard-node' || !nodeTargets) return node;
        let nodeChanged = false;
        const shots = (node.settings?.shots || []).map(shot => {
            const target = nodeTargets.get(String(shot.id));
            if (!target || shot.status !== 'generating') return shot;
            const startedAt = target.generationStartTime ?? target.shot?.generationStartTime;
            // Older tasks may lack a start time: only the unchanged shot object
            // is safe to stop in that case. IDs alone can refer to a later run.
            const sameAttempt = startedAt != null
                ? shot.generationStartTime === startedAt
                : shot === target.shot;
            if (!sameAttempt) return shot;
            nodeChanged = true;
            return {
                ...shot,
                status: 'failed',
                errorMsg: '已手动终止',
                ...(shot.generationStartTime ? { durationCost: Number(((now - shot.generationStartTime) / 1000).toFixed(1)) } : {}),
            };
        });
        if (!nodeChanged) return node;
        changed = true;
        return { ...node, settings: { ...node.settings, shots } };
    });
    return changed ? updatedNodes : nodes;
}
