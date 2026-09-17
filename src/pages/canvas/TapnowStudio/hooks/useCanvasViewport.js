import { useEffect, useMemo, useState } from 'react';
import { createCanvasZoomScheduler, getCanvasViewportBounds } from '../canvasViewport';
import { scrollNodeWheel } from '../nodeWheel';

export function useCanvasViewportBounds(canvasRef, view) {
    const [size, setSize] = useState(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const measure = () => {
            const { width, height } = canvas.getBoundingClientRect();
            setSize(previous => previous?.width === width && previous?.height === height ? previous : { width, height });
        };
        measure();
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
        observer?.observe(canvas);
        window.addEventListener('resize', measure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [canvasRef]);
    return useMemo(() => getCanvasViewportBounds(view, size), [view, size]);
}

export function useCanvasWheelZoom(canvasRef, viewRef, setView) {
    const [isZooming, setIsZooming] = useState(false);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let idleTimer = null;
        const scheduler = createCanvasZoomScheduler({
            viewRef, commit: setView,
            requestFrame: callback => window.requestAnimationFrame(callback),
            cancelFrame: id => window.cancelAnimationFrame(id),
        });
        const onWheel = event => {
            if (event.ctrlKey) {
                if (event.cancelable) event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (scrollNodeWheel(event, canvas)) return;
            if (event.cancelable) event.preventDefault();
            const rect = canvas.getBoundingClientRect();
            if (!scheduler.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY)) return;
            if (idleTimer === null) setIsZooming(true);
            else clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                idleTimer = null;
                setIsZooming(false);
            }, 140);
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', onWheel);
            scheduler.dispose();
            if (idleTimer !== null) clearTimeout(idleTimer);
        };
    }, [canvasRef, viewRef, setView]);
    return isZooming;
}
