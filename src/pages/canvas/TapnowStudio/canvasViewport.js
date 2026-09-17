export function getCanvasViewportBounds(view, size, padding = 200) {
    if (!size || size.width <= 0 || size.height <= 0) return null;
    return {
        left: (-view.x - padding) / view.zoom,
        right: (size.width - view.x + padding) / view.zoom,
        top: (-view.y - padding) / view.zoom,
        bottom: (size.height - view.y + padding) / view.zoom,
    };
}

export function filterVisibleCanvasNodes(nodes, bounds, retainedIds = new Set()) {
    if (!bounds) return nodes;
    return nodes.filter(node => retainedIds.has(node.id) || (
        node.x < bounds.right && node.x + (node.width || 260) > bounds.left &&
        node.y < bounds.bottom && node.y + (node.height || 200) > bounds.top
    ));
}

// Accumulate every wheel delta, but commit React state only once per display frame.
export function createCanvasZoomScheduler({ viewRef, commit, requestFrame, cancelFrame }) {
    let frame = null;
    return {
        zoomAt(x, y, deltaY) {
            if (!deltaY) return false;
            const previous = viewRef.current;
            const zoom = Math.min(3, Math.max(0.2, previous.zoom * (deltaY > 0 ? 0.9 : 1.1)));
            if (zoom === previous.zoom) return false;
            const scale = zoom / previous.zoom;
            viewRef.current = { zoom, x: x - (x - previous.x) * scale, y: y - (y - previous.y) * scale };
            if (frame === null) frame = requestFrame(() => {
                frame = null;
                commit(viewRef.current);
            });
            return true;
        },
        dispose() {
            if (frame !== null) cancelFrame(frame);
            frame = null;
        },
    };
}
