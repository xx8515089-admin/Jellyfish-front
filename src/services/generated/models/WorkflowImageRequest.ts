/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WorkflowImageRequest = {
    clientRequestId?: string;
    segmentId: number;
    modelId?: number;
    prompt?: string;
    aspectRatio?: string;
    resolution?: number;
    quality?: number | null;
    visualStyleId?: number | null;
    toneStyleId?: number | null;
    referenceFileIds?: Array<number>;
    skillCode?: 'storyboard-master';
};

