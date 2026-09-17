// Resolve each source once per semantic graph snapshot, even with many outgoing wires.
export function buildConnectedNodeIOEnvelopeCache({ connections, nodesMap, readMedia, readText, version, isValid }) {
    const cache = new Map();
    const payloads = new Map();
    const mediaCache = new Map();
    for (const connection of connections) {
        const source = nodesMap.get(connection.from);
        if (!source) continue;
        if (!payloads.has(source.id)) {
            const media = readMedia(source, { mediaCache });
            const text = readText(source);
            payloads.set(source.id, media.length || text.length ? {
                media, text, kind: media.length && text.length ? 'mixed' : media.length ? 'media' : 'text',
            } : null);
        }
        const payload = payloads.get(source.id);
        if (!payload) continue;
        const inputType = connection.inputType || 'default';
        const envelope = {
            version, ...payload,
            meta: { sourceNodeId: source.id, sourceNodeType: source.type || '', targetNodeId: connection.to || '', inputType },
        };
        if (!isValid(envelope)) continue;
        if (!cache.has(connection.to)) cache.set(connection.to, new Map());
        const inputs = cache.get(connection.to);
        if (!inputs.has(inputType)) inputs.set(inputType, []);
        inputs.get(inputType).push(envelope);
    }
    return cache;
}
