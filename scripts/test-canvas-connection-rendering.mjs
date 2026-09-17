import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import {
    buildConnectionRenderEntries,
    getConnectionGeometry,
    getVisibleConnectionEntries
} from '../src/pages/canvas/TapnowStudio/canvasConnectionRendering.js';

const source = { id: 'source', x: 0, y: 0, width: 100, height: 100, type: 'gen-image' };
const target = { id: 'target', x: 500, y: 200, width: 100, height: 200, type: 'preview' };
const edge = { id: 'edge', from: source.id, to: target.id };
const graph = (nodes = [source, target], connections = [edge]) => {
    const to = new Map();
    for (const connection of connections) {
        if (!to.has(connection.to)) to.set(connection.to, []);
        to.get(connection.to).push(connection);
    }
    return { connections, nodesMap: new Map(nodes.map(node => [node.id, node])), connectionsByNode: { to } };
};
const geometry = (data, connection = data.connections[0], getApiConfigByKey) => getConnectionGeometry({
    conn: connection,
    fromNode: data.nodesMap.get(connection.from),
    toNode: data.nodesMap.get(connection.to),
    connectionsByNode: data.connectionsByNode,
    getApiConfigByKey
});

test('geometry preserves the existing curve and all projection coordinates', () => {
    const value = geometry(graph());
    assert.equal(value.pathD, 'M 96 50 C 300 50, 300 300, 504 300');
    assert.equal(value.midX, 300);
    assert.equal(value.midY, 175);
    assert.equal(getConnectionGeometry({ conn: edge, fromNode: source }), null);
});

test('non-geometric node updates reuse every edge; moving one node only invalidates its edges', () => {
    const other = { ...target, id: 'other', y: 800 };
    const connections = [edge, { ...edge, id: 'other-edge', to: other.id }];
    const initial = buildConnectionRenderEntries(graph([source, target, other], connections));
    const contentUpdate = buildConnectionRenderEntries({
        ...graph([source, { ...target, content: 'new-media', settings: { prompt: 'edited' } }, other], connections),
        previousEntries: initial
    });
    assert.strictEqual(contentUpdate.get(edge.id), initial.get(edge.id));
    assert.strictEqual(contentUpdate.get('other-edge'), initial.get('other-edge'));
    const moved = buildConnectionRenderEntries({
        ...graph([source, { ...target, x: target.x + 10 }, other], connections), previousEntries: contentUpdate
    });
    assert.notStrictEqual(moved.get(edge.id), initial.get(edge.id));
    assert.strictEqual(moved.get('other-edge'), initial.get('other-edge'));
    assert.equal(moved.get(edge.id).geometry.endX, 514);
});

test('removed connections and missing endpoints are evicted from the render cache', () => {
    const initial = buildConnectionRenderEntries(graph());
    assert.equal(buildConnectionRenderEntries({ ...graph([source]), previousEntries: initial }).size, 0);
    assert.equal(buildConnectionRenderEntries({ ...graph([source, target], []), previousEntries: initial }).size, 0);
});

test('compare ports follow incoming order and update when the first input is disconnected', () => {
    const compare = { ...target, type: 'image-compare' };
    const second = { ...edge, id: 'second' };
    const data = graph([source, compare], [edge, second]);
    assert.equal(geometry(data, edge).endY, 266);
    assert.equal(geometry(data, second).endY, 332);
    const initial = buildConnectionRenderEntries(data);
    const updated = buildConnectionRenderEntries({ ...graph([source, compare], [second]), previousEntries: initial });
    assert.equal(updated.get(second.id).geometry.endY, 266);
    assert.notStrictEqual(updated.get(second.id), initial.get(second.id));
});

test('Midjourney reference ports track default references and model changes', () => {
    const image = { ...target, type: 'gen-image', settings: { model: 'mj' } };
    const oref = { ...edge, id: 'oref', inputType: 'oref' };
    const sref = { ...edge, id: 'sref', inputType: 'sref' };
    const model = () => ({ id: 'mj', provider: 'Midjourney' });
    const withoutReference = graph([source, image], [oref, sref]);
    assert.equal(geometry(withoutReference, oref, model).endY, image.y + 152);
    assert.equal(geometry(withoutReference, sref, model).endY, image.y + 208);
    const withReference = graph([source, image], [oref, sref, edge]);
    assert.equal(geometry(withReference, oref, model).endY, image.y + 220);
    assert.equal(geometry(withReference, sref, model).endY, image.y + 276);
    assert.equal(geometry(withReference, oref, () => ({ id: 'other' })).endY, image.y + image.height / 2);
});

test('video start and end ports preserve their height-dependent panel offsets', () => {
    const video = { ...target, type: 'gen-video', height: 400 };
    const start = { ...edge, id: 'start', inputType: 'veo_start' };
    const end = { ...edge, id: 'end', inputType: 'veo_end' };
    const data = graph([source, video], [start, end]);
    assert.equal(geometry(data, start).endY, video.y + 107 + 160);
    assert.equal(geometry(data, end).endY, video.y + 133 + 160);
    assert.equal(geometry(graph([source, video], [start, edge]), start).endY, video.y + 107 + 160 + 68);
});

test('viewport culling keeps crossing edges with both endpoints outside and removes distant edges', () => {
    const left = { ...source, x: -1000, y: 100 };
    const right = { ...target, x: 1000, y: 50 };
    const distant = { ...target, id: 'distant', x: 1400, y: 3000 };
    const entries = buildConnectionRenderEntries(graph([left, right, distant], [edge, { id: 'distant-edge', from: distant.id, to: distant.id }]));
    const bounds = { left: 0, right: 600, top: 0, bottom: 400 };
    assert.deepEqual(getVisibleConnectionEntries(entries, new Set(), bounds).map(value => value.id), [edge.id]);
    assert.equal(getVisibleConnectionEntries(entries, new Set()).length, 0);
    assert.equal(getVisibleConnectionEntries(entries, new Set([distant.id]), bounds).length, 2, 'pinned drag nodes keep their projected connections');
    assert.strictEqual(getVisibleConnectionEntries(entries, new Set(), bounds)[0], entries.get(edge.id));
});

test('backwards connection bounds contain curved sections beyond the endpoints', () => {
    const value = geometry(graph([{ ...source, x: 1000 }, { ...target, x: 0 }]));
    assert.ok(value.minX < value.endX);
    assert.ok(value.maxX > value.startX);
    const entries = new Map([[edge.id, { ...edge, geometry: value }]]);
    assert.equal(getVisibleConnectionEntries(entries, new Set(), { left: 1200, right: 1600, top: 0, bottom: 400 }).length, 1);
});

test('a 5000-edge hub indexes its incoming connections once across rendering and drag projection', () => {
    const compare = { ...target, type: 'image-compare' };
    const connections = Array.from({ length: 5000 }, (_, index) => ({ ...edge, id: `edge-${index}` }));
    const data = graph([source, compare], connections);
    const incoming = data.connectionsByNode.to.get(compare.id);
    let visited = 0;
    incoming.forEach = callback => Array.prototype.forEach.call(incoming, (...args) => { visited++; callback(...args); });
    const first = buildConnectionRenderEntries(data);
    assert.equal(visited, 5000);
    const second = buildConnectionRenderEntries({ ...data, previousEntries: first });
    for (const connection of connections) geometry(data, connection);
    assert.equal(visited, 5000, 'neither unchanged renders nor projections rescan the hub');
    assert.equal(second.size, 5000);
    assert.ok([...second].every(([id, value]) => value === first.get(id)));
});

let connectionLayer;
async function loadConnectionLayer() {
    if (connectionLayer) return connectionLayer;
    const file = new URL('../src/pages/canvas/TapnowStudio/components/ConnectionLayer.jsx', import.meta.url);
    const sourceCode = (await readFile(file, 'utf8'))
        .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
        .replaceAll("'lucide-react'", JSON.stringify(import.meta.resolve('lucide-react')))
        .replaceAll("'../canvasConnectionRendering'", JSON.stringify(new URL('../canvasConnectionRendering.js', file).href));
    const transformed = await transformWithEsbuild(sourceCode, file.pathname, { loader: 'jsx', jsx: 'automatic', jsxImportSource: 'react' });
    const code = transformed.code.replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve('react/jsx-runtime')));
    connectionLayer = (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).default;
    return connectionLayer;
}

test('low-detail edges retain their drag and disconnect targets while reducing SVG elements', async () => {
    const Layer = await loadConnectionLayer();
    const data = graph();
    const props = { ...data, visibleNodes: [source, target], mousePos: { x: 0, y: 0 }, onDisconnectConnection() {} };
    const full = renderToStaticMarkup(React.createElement(Layer, props));
    const low = renderToStaticMarkup(React.createElement(Layer, { ...props, isLowDetail: true }));
    for (const markup of [full, low]) {
        for (const marker of ['data-connection-id="edge"', 'data-conn-path="hit"', 'data-conn-path="line"', 'data-conn-point="delete-hot"', 'data-conn-point="delete-inner"']) {
            assert.ok(markup.includes(marker), marker);
        }
    }
    for (const marker of ['data-conn-path="shadow"', 'data-conn-point="start"', 'data-conn-point="end"', 'data-conn-icon="delete"']) {
        assert.ok(full.includes(marker), marker);
        assert.ok(!low.includes(marker), marker);
    }
    const elements = value => (value.match(/<[a-z][^/]*?>/g) || []).length;
    assert.ok(elements(low) < elements(full) * 0.7, 'overview edges should mount substantially fewer SVG elements');
});

test('idle pointer movement skips the entire layer, but active drafts and viewport changes update', async () => {
    const Layer = await loadConnectionLayer();
    const data = graph();
    const props = { ...data, visibleNodes: [source, target], mousePos: { x: 0, y: 0 }, onDisconnectConnection() {} };
    assert.equal(Layer.compare(props, { ...props, mousePos: { x: 50, y: 100 } }), true);
    const connecting = { ...props, connectingSource: source.id };
    assert.equal(Layer.compare(connecting, { ...connecting, mousePos: { x: 50, y: 100 } }), false);
    assert.equal(Layer.compare(connecting, props), false, 'finishing a connection must remove the draft');
    assert.equal(Layer.compare(props, { ...props, viewportBounds: { left: 0, right: 600, top: 0, bottom: 400 } }), false);
    assert.equal(Layer.compare(props, { ...props, isLowDetail: true }), false);
});
