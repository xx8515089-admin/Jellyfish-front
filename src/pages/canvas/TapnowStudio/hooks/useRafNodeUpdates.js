import { useCallback, useEffect, useRef } from 'react';

const mergeNodeUpdates = (existingUpdates, nextUpdates) => {
    const updateMap = new Map();

    existingUpdates.forEach(({ nodeId, updater }) => {
        updateMap.set(nodeId, updater);
    });

    nextUpdates.forEach(({ nodeId, updater }) => {
        updateMap.set(nodeId, updater);
    });

    return Array.from(updateMap.entries()).map(([nodeId, updater]) => ({
        nodeId,
        updater
    }));
};

const applyMultiNodeUpdates = (prev, updates) => {
    const nodeIdMap = new Map(updates.map(({ nodeId }) => [nodeId, true]));

    if (prev.length > 50 && updates.length > 10) {
        const nodeIndexMap = new Map();
        prev.forEach((node, idx) => {
            if (nodeIdMap.has(node.id)) {
                nodeIndexMap.set(node.id, idx);
            }
        });

        const next = [...prev];
        let hasChanges = false;
        updates.forEach(({ nodeId, updater }) => {
            const idx = nodeIndexMap.get(nodeId);
            if (idx !== undefined) {
                const updatedNode = updater(next[idx]);
                if (updatedNode !== next[idx]) {
                    next[idx] = updatedNode;
                    hasChanges = true;
                }
            }
        });

        return hasChanges ? next : prev;
    }

    const next = [...prev];
    let hasChanges = false;
    updates.forEach(({ nodeId, updater }) => {
        const idx = next.findIndex((node) => node.id === nodeId);
        if (idx !== -1) {
            const updatedNode = updater(next[idx]);
            if (updatedNode !== next[idx]) {
                next[idx] = updatedNode;
                hasChanges = true;
            }
        }
    });

    return hasChanges ? next : prev;
};

export function useRafNodeUpdates(setNodes) {
    const nodeUpdateRef = useRef(null);
    const nodeUpdateRaf = useRef(null);
    const multiNodeUpdateRef = useRef(null);

    const flushNodeUpdate = useCallback(() => {
        if (multiNodeUpdateRef.current) {
            const updates = multiNodeUpdateRef.current;

            setNodes((prev) => applyMultiNodeUpdates(prev, updates));
            multiNodeUpdateRef.current = null;
            nodeUpdateRaf.current = null;
            return;
        }

        if (!nodeUpdateRef.current) {
            nodeUpdateRaf.current = null;
            return;
        }

        const { nodeId, updater } = nodeUpdateRef.current;
        setNodes((prev) => {
            const idx = prev.findIndex((node) => node.id === nodeId);
            if (idx === -1) return prev;

            const updatedNode = updater(prev[idx]);
            if (updatedNode === prev[idx]) return prev;

            const next = [...prev];
            next[idx] = updatedNode;
            return next;
        });
        nodeUpdateRef.current = null;
        nodeUpdateRaf.current = null;
    }, [setNodes]);

    const scheduleNodeUpdate = useCallback((nodeId, updater) => {
        nodeUpdateRef.current = { nodeId, updater };
        if (!nodeUpdateRaf.current) {
            nodeUpdateRaf.current = requestAnimationFrame(flushNodeUpdate);
        }
    }, [flushNodeUpdate]);

    const scheduleMultiNodeUpdate = useCallback((updates) => {
        if (multiNodeUpdateRef.current && nodeUpdateRaf.current) {
            multiNodeUpdateRef.current = mergeNodeUpdates(multiNodeUpdateRef.current, updates);
        } else {
            multiNodeUpdateRef.current = updates;
        }

        if (!nodeUpdateRaf.current) {
            nodeUpdateRaf.current = requestAnimationFrame(flushNodeUpdate);
        }
    }, [flushNodeUpdate]);

    useEffect(() => {
        return () => {
            if (nodeUpdateRaf.current) {
                cancelAnimationFrame(nodeUpdateRaf.current);
            }
        };
    }, []);

    return {
        nodeUpdateRef,
        nodeUpdateRaf,
        multiNodeUpdateRef,
        flushNodeUpdate,
        scheduleNodeUpdate,
        scheduleMultiNodeUpdate
    };
}
