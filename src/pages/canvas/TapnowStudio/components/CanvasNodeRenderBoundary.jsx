import { memo } from 'react';

function CanvasNodeRenderBoundaryComponent({ node, renderNode }) {
    return renderNode(node);
}

const areNodeRenderPropsEqual = (prevProps, nextProps) => {
    if (prevProps.node !== nextProps.node) return false;
    if (prevProps.isInteracting !== nextProps.isInteracting) return false;

    const visualFlagsEqual =
        prevProps.theme === nextProps.theme &&
        prevProps.isLowDetail === nextProps.isLowDetail &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isDragging === nextProps.isDragging &&
        prevProps.isHoverTarget === nextProps.isHoverTarget &&
        prevProps.isAdjacent === nextProps.isAdjacent &&
        prevProps.isConnected === nextProps.isConnected;

    if (!visualFlagsEqual) return false;

    if (nextProps.isInteracting) {
        return true;
    }

    return prevProps.renderNode === nextProps.renderNode;
};

const CanvasNodeRenderBoundary = memo(CanvasNodeRenderBoundaryComponent, areNodeRenderPropsEqual);

CanvasNodeRenderBoundary.displayName = 'CanvasNodeRenderBoundary';

export default CanvasNodeRenderBoundary;
