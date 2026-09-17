const EMPTY_INPUTS = { hasDefaultReference: false, indexById: new Map() };
const incomingMetadata = new WeakMap();

// Incoming arrays are immutable graph snapshots. Index each one once, including
// for the imperative drag projection, instead of scanning a dense hub per edge.
const getIncomingMetadata = (connectionsByNode, nodeId) => {
    const incoming = connectionsByNode?.to?.get(nodeId);
    if (!incoming?.length) return EMPTY_INPUTS;
    let metadata = incomingMetadata.get(incoming);
    if (!metadata) {
        metadata = { hasDefaultReference: false, indexById: new Map() };
        incoming.forEach((connection, index) => {
            if (!metadata.indexById.has(connection.id)) metadata.indexById.set(connection.id, index);
            if (!connection.inputType || connection.inputType === 'default') metadata.hasDefaultReference = true;
        });
        incomingMetadata.set(incoming, metadata);
    }
    return metadata;
};

export const getMediaInstructionInputY = (node, inputType, connectionsByNode, getApiConfigByKey) => {
    if (node.type === 'gen-image' && (inputType === 'oref' || inputType === 'sref')) {
        const model = getApiConfigByKey?.(node.settings?.model);
        const isMidjourney = !!model && (
            String(model.id || '').includes('mj') ||
            String(model.provider || '').toLowerCase().includes('midjourney')
        );
        if (!isMidjourney) return null;
        const referenceHeight = getIncomingMetadata(connectionsByNode, node.id).hasDefaultReference ? 68 : 0;
        const promptBottom = 12 + 16 + 8 + referenceHeight + 100 + 8;
        const instructionCenter = inputType === 'oref' ? 8 : 16 + 6 + 28 + 6 + 8;
        return node.y + promptBottom + instructionCenter;
    }

    if (node.type === 'gen-video' && (inputType === 'veo_start' || inputType === 'veo_end')) {
        const referenceHeight = getIncomingMetadata(connectionsByNode, node.id).hasDefaultReference ? 68 : 0;
        const promptHeight = Math.max(110, Math.min(180, node.height * 0.4));
        const promptBottom = 12 + 16 + 8 + referenceHeight + promptHeight + 8;
        const firstRowCenter = promptBottom + 12 + 14 + 8 + 12 + 8 + 9;
        return node.y + firstRowCenter + (inputType === 'veo_end' ? 26 : 0);
    }
    return null;
};

const getConnectionEndpoints = ({ conn, fromNode, toNode, connectionsByNode, getApiConfigByKey }) => {
    if (!conn || !fromNode || !toNode) return null;
    const startX = fromNode.x + fromNode.width - 4;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x + 4;
    let endY = toNode.y + toNode.height / 2;

    if (toNode.type === 'image-compare') {
        const index = getIncomingMetadata(connectionsByNode, toNode.id).indexById.get(conn.id);
        if (index === 0) endY = toNode.y + toNode.height * 0.33;
        else if (index >= 1) endY = toNode.y + toNode.height * 0.66;
    }
    const inputY = getMediaInstructionInputY(toNode, conn.inputType, connectionsByNode, getApiConfigByKey);
    if (typeof inputY === 'number') endY = inputY;
    return { startX, startY, endX, endY };
};

const createGeometry = ({ startX, startY, endX, endY }) => {
    const distance = Math.abs(endX - startX);
    const cp1X = startX + distance * 0.5;
    const cp2X = endX - distance * 0.5;
    return {
        startX, startY, endX, endY,
        midX: (startX + endX) / 2,
        midY: (startY + endY) / 2,
        pathD: `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`,
        // The control-point hull contains the entire cubic, including backwards
        // connections whose curves extend beyond both endpoint rectangles.
        minX: Math.min(startX, cp1X, cp2X, endX),
        maxX: Math.max(startX, cp1X, cp2X, endX),
        minY: Math.min(startY, endY),
        maxY: Math.max(startY, endY)
    };
};

export const getConnectionGeometry = (args) => {
    const endpoints = getConnectionEndpoints(args);
    return endpoints ? createGeometry(endpoints) : null;
};

export function buildConnectionRenderEntries({
    connections, nodesMap, connectionsByNode, getApiConfigByKey, previousEntries
}) {
    const entries = new Map();
    for (const conn of connections) {
        const endpoints = getConnectionEndpoints({
            conn, fromNode: nodesMap.get(conn.from), toNode: nodesMap.get(conn.to),
            connectionsByNode, getApiConfigByKey
        });
        if (!endpoints) continue;
        const previous = previousEntries?.get(conn.id);
        const geometry = previous?.geometry;
        if (previous?.from === conn.from && previous?.to === conn.to &&
            geometry.startX === endpoints.startX && geometry.startY === endpoints.startY &&
            geometry.endX === endpoints.endX && geometry.endY === endpoints.endY) {
            entries.set(conn.id, previous);
        } else {
            entries.set(conn.id, { id: conn.id, from: conn.from, to: conn.to, geometry: createGeometry(endpoints) });
        }
    }
    return entries;
}

export function getVisibleConnectionEntries(entries, visibleNodeIds, viewportBounds) {
    const visible = [];
    const hasViewport = viewportBounds && ['left', 'right', 'top', 'bottom'].every(
        (key) => Number.isFinite(viewportBounds[key])
    );
    for (const entry of entries.values()) {
        const { geometry } = entry;
        if (visibleNodeIds.has(entry.from) || visibleNodeIds.has(entry.to) || (hasViewport &&
            geometry.maxX + 25 >= viewportBounds.left && geometry.minX - 25 <= viewportBounds.right &&
            geometry.maxY + 25 >= viewportBounds.top && geometry.minY - 25 <= viewportBounds.bottom)) {
            visible.push(entry);
        }
    }
    return visible;
}
