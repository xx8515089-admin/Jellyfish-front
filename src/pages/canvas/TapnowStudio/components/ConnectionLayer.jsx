import { memo, useMemo, useRef } from 'react';
import { Unlink } from 'lucide-react';
import {
    buildConnectionRenderEntries,
    getMediaInstructionInputY,
    getVisibleConnectionEntries
} from '../canvasConnectionRendering';

export { getConnectionGeometry } from '../canvasConnectionRendering';

const ConnectionEdge = memo(function ConnectionEdge({ entry, isRelatedToSelected, isLowDetail, onDisconnectConnection }) {
    const { id, geometry } = entry;
    const { startX, startY, endX, endY, midX, midY, pathD } = geometry;
    const disconnect = (event) => {
        event.stopPropagation();
        event.preventDefault();
        onDisconnectConnection(id);
    };

    return (
        <g data-connection-id={id} className="connection-group" style={{ opacity: isRelatedToSelected ? 1 : 0.35 }}>
            <path data-conn-path="hit" d={pathD} stroke="transparent" strokeWidth="20" fill="none" style={{ pointerEvents: 'stroke' }} />
            {!isLowDetail && <path data-conn-path="shadow" d={pathD} stroke="#18181b" strokeWidth="4" fill="none" />}
            <path data-conn-path="line" d={pathD} stroke="#71717a" strokeWidth="2" fill="none" />
            {!isLowDetail && <>
                <circle data-conn-point="start" cx={startX} cy={startY} r="2" fill="#71717a" />
                <circle data-conn-point="end" cx={endX} cy={endY} r="2" fill="#71717a" />
            </>}
            <g
                className="connection-delete cursor-pointer"
                style={{ pointerEvents: 'auto', cursor: 'pointer', ...(isRelatedToSelected ? { opacity: 1 } : {}) }}
                onClick={disconnect}
                onMouseDown={disconnect}
            >
                <circle data-conn-point="delete-hot" cx={midX} cy={midY} r="25" fill="transparent" />
                {!isLowDetail && <circle data-conn-point="delete-outer" cx={midX} cy={midY} r="12" fill="#ef4444" opacity="0.8" style={{ pointerEvents: 'none' }} />}
                <circle data-conn-point="delete-inner" cx={midX} cy={midY} r={isLowDetail ? 12 : 8} fill="#ef4444" style={{ pointerEvents: 'none' }} />
                {!isLowDetail && <Unlink data-conn-icon="delete" size={10} className="text-white" x={midX - 5} y={midY - 5} style={{ pointerEvents: 'none' }} />}
            </g>
        </g>
    );
});

// Pointer movement updates only the draft wire. Existing SVG children and their
// geometry stay untouched, even when a hub has thousands of incoming edges.
const StaticConnections = memo(function StaticConnections({
    connections, nodesMap, connectionsByNode, getApiConfigByKey, selectedNodeId,
    onDisconnectConnection, visibleNodes, viewportBounds, isLowDetail
}) {
    const entriesRef = useRef();
    const entries = useMemo(() => {
        const nextEntries = buildConnectionRenderEntries({
            connections, nodesMap, connectionsByNode, getApiConfigByKey,
            previousEntries: entriesRef.current
        });
        entriesRef.current = nextEntries;
        return nextEntries;
    }, [connections, nodesMap, connectionsByNode, getApiConfigByKey]);
    const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
    const visibleEntries = useMemo(
        () => getVisibleConnectionEntries(entries, visibleNodeIds, viewportBounds),
        [entries, visibleNodeIds, viewportBounds]
    );
    return visibleEntries.map((entry) => (
        <ConnectionEdge
            key={entry.id}
            entry={entry}
            isRelatedToSelected={!!selectedNodeId && (entry.from === selectedNodeId || entry.to === selectedNodeId)}
            isLowDetail={isLowDetail}
            onDisconnectConnection={onDisconnectConnection}
        />
    ));
});

function ConnectionDraft({ nodesMap, connectionsByNode, connectingSource, connectingTarget, connectingInputType, mousePos, getApiConfigByKey }) {
    const source = connectingSource ? nodesMap.get(connectingSource) : null;
    const target = connectingTarget ? nodesMap.get(connectingTarget) : null;
    const targetY = target ? (getMediaInstructionInputY(target, connectingInputType, connectionsByNode, getApiConfigByKey) ?? target.y + target.height / 2) : 0;
    return <>
        {source && <path d={`M ${source.x + source.width - 4} ${source.y + source.height / 2} C ${source.x + source.width + 100} ${source.y + source.height / 2}, ${mousePos.x - 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />}
        {target && <path d={`M ${target.x + 4} ${targetY} C ${target.x + 4 - 100} ${targetY}, ${mousePos.x + 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />}
    </>;
}

function ConnectionLayerComponent({
    layerRef, connections, nodesMap, connectionsByNode, connectingSource, connectingTarget,
    connectingInputType, mousePos, getApiConfigByKey, selectedNodeId, onDisconnectConnection,
    visibleNodes, viewportBounds, isLowDetail = false
}) {
    return (
        <div ref={layerRef} className="absolute inset-0 pointer-events-none overflow-visible w-full h-full">
            <svg className="absolute inset-0 overflow-visible w-full h-full pointer-events-none">
                <StaticConnections
                    connections={connections}
                    nodesMap={nodesMap}
                    connectionsByNode={connectionsByNode}
                    getApiConfigByKey={getApiConfigByKey}
                    selectedNodeId={selectedNodeId}
                    onDisconnectConnection={onDisconnectConnection}
                    visibleNodes={visibleNodes}
                    viewportBounds={viewportBounds}
                    isLowDetail={isLowDetail}
                />
                <ConnectionDraft
                    nodesMap={nodesMap}
                    connectionsByNode={connectionsByNode}
                    connectingSource={connectingSource}
                    connectingTarget={connectingTarget}
                    connectingInputType={connectingInputType}
                    mousePos={mousePos}
                    getApiConfigByKey={getApiConfigByKey}
                />
            </svg>
        </div>
    );
}

const ConnectionLayer = memo(ConnectionLayerComponent, (previous, next) => {
    const graphProps = [
        'layerRef', 'connections', 'nodesMap', 'connectionsByNode', 'visibleNodes', 'viewportBounds',
        'selectedNodeId', 'getApiConfigByKey', 'onDisconnectConnection', 'isLowDetail',
        'connectingSource', 'connectingTarget', 'connectingInputType'
    ];
    return graphProps.every((key) => previous[key] === next[key]) && (
        (!next.connectingSource && !next.connectingTarget) ||
        (previous.mousePos.x === next.mousePos.x && previous.mousePos.y === next.mousePos.y)
    );
});

ConnectionLayer.displayName = 'ConnectionLayer';
export default ConnectionLayer;
