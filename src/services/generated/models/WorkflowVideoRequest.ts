/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WorkflowVideoRequest = {
    clientRequestId?: string;
    segmentId: number;
    modelId?: number;
    prompt?: string;
    aspectRatio?: string;
    resolution?: string;
    quality?: number | null;
    visualStyleId?: number | null;
    toneStyleId?: number | null;
    referenceFileIds?: Array<number>;
    durationSeconds?: number;
    generateAudio?: boolean;
    inheritPreviousVideo?: boolean;
    referenceVideoDurationSeconds?: number;
    directorPromptRunId?: number | null;
};

