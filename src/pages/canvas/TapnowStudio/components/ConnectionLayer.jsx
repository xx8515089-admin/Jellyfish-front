import { memo, useMemo } from 'react';
import { Unlink } from 'lucide-react';

const getSafeString = (value) => String(value || '');

const isMidjourneyModel = (model) => {
    const modelId = getSafeString(model?.id);
    const provider = getSafeString(model?.provider).toLowerCase();
    return !!model && (modelId.includes('mj') || provider.includes('midjourney'));
};

const hasDefaultReferenceConnection = (connectionsByNode, nodeId) => {
    const toNodeConns = connectionsByNode?.to?.get(nodeId) || [];
    return toNodeConns.some((conn) => !conn.inputType || conn.inputType === 'default');
};

const getMediaInstructionInputY = (node, inputType, connectionsByNode, getApiConfigByKey) => {
    if (node.type === 'gen-image' && (inputType === 'oref' || inputType === 'sref')) {
        const currentModel = getApiConfigByKey?.(node.settings?.model);
        if (!isMidjourneyModel(currentModel)) return null;

        const paddingTop = 12;
        const timerHeight = 28;
        const timerMarginBottom = 8;
        const titleHeight = 16;
        const titleMarginBottom = 8;
        const refAreaHeight = 60;
        const refAreaMarginBottom = 8;
        const promptAreaHeight = 100;
        const promptAreaMarginBottom = 8;
        const instructionGap = 6;
        const instructionItemHeight = 16;
        const owInputHeight = 28;
        const hasTimer = false;
        const hasRefArea = hasDefaultReferenceConnection(connectionsByNode, node.id);

        let baseOffset = paddingTop;
        if (hasTimer) {
            baseOffset += timerHeight + timerMarginBottom;
        }
        baseOffset += titleHeight + titleMarginBottom;
        if (hasRefArea) {
            baseOffset += refAreaHeight + refAreaMarginBottom;
        }
        baseOffset += promptAreaHeight + promptAreaMarginBottom;

        if (inputType === 'oref') {
            return node.y + baseOffset + instructionItemHeight * 0.5;
        }

        return node.y + baseOffset + instructionItemHeight + instructionGap + owInputHeight + instructionGap + instructionItemHeight * 0.5;
    }

    if (node.type === 'gen-video' && (inputType === 'veo_start' || inputType === 'veo_end')) {
        const paddingTop = 12;
        const timerHeight = 28;
        const timerMarginBottom = 8;
        const titleHeight = 16;
        const titleMarginBottom = 8;
        const refAreaHeight = 60;
        const refAreaMarginBottom = 8;
        const promptAreaHeight = Math.max(110, Math.min(180, node.height * 0.4));
        const promptAreaMarginBottom = 8;
        const panelPaddingTop = 12;
        const panelTitleHeight = 14;
        const panelDescHeight = 12;
        const panelGap = 8;
        const panelRowHeight = 18;
        const panelRowGap = 8;
        const hasTimer = false;
        const hasRefArea = hasDefaultReferenceConnection(connectionsByNode, node.id);

        let baseOffset = paddingTop;
        if (hasTimer) {
            baseOffset += timerHeight + timerMarginBottom;
        }
        baseOffset += titleHeight + titleMarginBottom;
        if (hasRefArea) {
            baseOffset += refAreaHeight + refAreaMarginBottom;
        }
        baseOffset += promptAreaHeight + promptAreaMarginBottom;

        const panelTop = baseOffset;
        const firstRowCenter = panelTop + panelPaddingTop + panelTitleHeight + panelGap + panelDescHeight + panelGap + panelRowHeight * 0.5;
        const secondRowCenter = firstRowCenter + panelRowHeight + panelRowGap;

        return node.y + (inputType === 'veo_start' ? firstRowCenter : secondRowCenter);
    }

    return null;
};

export function getConnectionGeometry({
    conn,
    fromNode,
    toNode,
    connectionsByNode,
    getApiConfigByKey
}) {
    if (!conn || !fromNode || !toNode) return null;

    const startX = fromNode.x + fromNode.width - 4;
    const startY = fromNode.y + fromNode.height / 2;
    const endX = toNode.x + 4;
    let endY = toNode.y + toNode.height / 2;

    if (toNode.type === 'image-compare') {
        const relevantConns = connectionsByNode?.to?.get(toNode.id) || [];
        const idx = relevantConns.findIndex((item) => item.id === conn.id);
        if (idx === 0) {
            endY = toNode.y + toNode.height * 0.33;
        } else if (idx >= 1) {
            endY = toNode.y + toNode.height * 0.66;
        }
    }

    const specialInputY = getMediaInstructionInputY(toNode, conn.inputType, connectionsByNode, getApiConfigByKey);
    if (typeof specialInputY === 'number') {
        endY = specialInputY;
    }

    const dist = Math.abs(endX - startX);
    const cp1X = startX + dist * 0.5;
    const cp2X = endX - dist * 0.5;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const pathD = `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;

    return {
        startX,
        startY,
        endX,
        endY,
        midX,
        midY,
        pathD
    };
}

function ConnectionLayerComponent({
    layerRef,
    connections,
    nodesMap,
    connectionsByNode,
    connectingSource,
    connectingTarget,
    connectingInputType,
    mousePos,
    getApiConfigByKey,
    selectedNodeId,
    onDisconnectConnection,
    visibleNodes
}) {
    const visibleNodeIds = useMemo(() => {
        return new Set(visibleNodes.map((node) => node.id));
    }, [visibleNodes]);

    const visibleConnections = useMemo(() => {
        return connections.filter((conn) =>
            visibleNodeIds.has(conn.from) || visibleNodeIds.has(conn.to)
        );
    }, [connections, visibleNodeIds]);

    return (
        <div ref={layerRef} className="absolute inset-0 pointer-events-none overflow-visible w-full h-full">
            <svg className="absolute inset-0 overflow-visible w-full h-full pointer-events-none">
                {visibleConnections.map((conn) => {
                    const fromNode = nodesMap.get(conn.from);
                    const toNode = nodesMap.get(conn.to);
                    const geometry = getConnectionGeometry({
                        conn,
                        fromNode,
                        toNode,
                        connectionsByNode,
                        getApiConfigByKey
                    });
                    if (!geometry) return null;

                    const {
                        startX,
                        startY,
                        endX,
                        endY,
                        midX,
                        midY,
                        pathD
                    } = geometry;

                    const isRelatedToSelected = selectedNodeId && (
                        fromNode.id === selectedNodeId ||
                        toNode.id === selectedNodeId
                    );
                    const opacity = isRelatedToSelected ? 1 : 0.35;

                    return (
                        <g key={conn.id} data-connection-id={conn.id} className="connection-group" style={{ opacity }}>
                            <path
                                data-conn-path="hit"
                                d={pathD}
                                stroke="transparent"
                                strokeWidth="20"
                                fill="none"
                                style={{ pointerEvents: 'stroke' }}
                            />
                            <path data-conn-path="shadow" d={pathD} stroke="#18181b" strokeWidth="4" fill="none" />
                            <path data-conn-path="line" d={pathD} stroke="#71717a" strokeWidth="2" fill="none" />
                            <circle data-conn-point="start" cx={startX} cy={startY} r="2" fill="#71717a" />
                            <circle data-conn-point="end" cx={endX} cy={endY} r="2" fill="#71717a" />
                            <g
                                className="connection-delete cursor-pointer"
                                style={{
                                    opacity: isRelatedToSelected ? 1 : 0.35,
                                    pointerEvents: 'auto',
                                    cursor: 'pointer'
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onDisconnectConnection(conn.id);
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onDisconnectConnection(conn.id);
                                }}
                            >
                                <circle
                                    data-conn-point="delete-hot"
                                    cx={midX}
                                    cy={midY}
                                    r="25"
                                    fill="transparent"
                                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onDisconnectConnection(conn.id);
                                    }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        onDisconnectConnection(conn.id);
                                    }}
                                />
                                <circle data-conn-point="delete-outer" cx={midX} cy={midY} r="12" fill="#ef4444" opacity="0.8" style={{ pointerEvents: 'none' }} />
                                <circle data-conn-point="delete-inner" cx={midX} cy={midY} r="8" fill="#ef4444" style={{ pointerEvents: 'none' }} />
                                <Unlink data-conn-icon="delete" size={10} className="text-white" x={midX - 5} y={midY - 5} style={{ pointerEvents: 'none' }} />
                            </g>
                        </g>
                    );
                })}
                {connectingSource && (() => {
                    const node = nodesMap.get(connectingSource);
                    if (!node) return null;
                    return <path d={`M ${node.x + node.width - 4} ${node.y + node.height / 2} C ${node.x + node.width + 100} ${node.y + node.height / 2}, ${mousePos.x - 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />;
                })()}
                {connectingTarget && (() => {
                    const node = nodesMap.get(connectingTarget);
                    if (!node) return null;

                    const startX = node.x + 4;
                    let startY = node.y + node.height / 2;
                    const specialInputY = getMediaInstructionInputY(node, connectingInputType, connectionsByNode, getApiConfigByKey);
                    if (typeof specialInputY === 'number') {
                        startY = specialInputY;
                    }

                    return <path d={`M ${startX} ${startY} C ${startX - 100} ${startY}, ${mousePos.x + 100} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`} stroke="#60a5fa" strokeWidth="2" fill="none" strokeDasharray="4,4" />;
                })()}
            </svg>
        </div>
    );
}

const ConnectionLayer = memo(ConnectionLayerComponent, (prevProps, nextProps) => {
    return (
        prevProps.layerRef === nextProps.layerRef &&
        prevProps.connections === nextProps.connections &&
        prevProps.nodesMap === nextProps.nodesMap &&
        prevProps.connectionsByNode === nextProps.connectionsByNode &&
        prevProps.visibleNodes === nextProps.visibleNodes &&
        prevProps.selectedNodeId === nextProps.selectedNodeId &&
        prevProps.getApiConfigByKey === nextProps.getApiConfigByKey &&
        prevProps.onDisconnectConnection === nextProps.onDisconnectConnection &&
        prevProps.connectingSource === nextProps.connectingSource &&
        prevProps.connectingTarget === nextProps.connectingTarget &&
        prevProps.connectingInputType === nextProps.connectingInputType &&
        prevProps.mousePos.x === nextProps.mousePos.x &&
        prevProps.mousePos.y === nextProps.mousePos.y
    );
});

ConnectionLayer.displayName = 'ConnectionLayer';

export default ConnectionLayer;
