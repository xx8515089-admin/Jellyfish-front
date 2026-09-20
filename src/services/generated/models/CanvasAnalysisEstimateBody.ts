/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CanvasAnalysisEstimateBody = {
    canvasId: (number | string);
    revisionNo: number;
    nodeId: string;
    sourceNodeId: string;
    operation: 'framePromptGenerate' | 'videoAnalyze' | 'transcribeAudio';
    modelId: number;
    selection: {
        frames?: Array<{
            frameId: string;
            assetId: (number | string);
            timeSeconds: number;
        }>;
        videoAssetId?: (number | string);
        audioAssetId?: (number | string);
    };
    parameters?: {
        segmentDurationSeconds?: number;
        startSeconds?: number;
        endSeconds?: number;
        promptLanguages?: Array<string>;
    };
};
