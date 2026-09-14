/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type WorkflowMedia = {
    id: number;
    generationRecordId?: number;
    mediaType?: 'image' | 'video';
    itemKey?: string;
    segmentId: number;
    taskId?: number;
    status: number;
    statusName?: string;
    progress?: number;
    errorMessage?: string;
    error?: string;
    terminal?: boolean;
    shouldPoll?: boolean;
    pollAfterSeconds?: number;
    outputReady?: boolean;
    outputFileId?: number | null;
    outputUrl?: string | null;
    contentUrl?: string;
    thumbnailUrl?: string | null;
    thumbnailStatus?: string;
    versionNo?: number;
    modelName?: string;
    prompt?: string;
    aspectRatio?: string;
    resolution?: (string | number);
    durationSeconds?: number;
    visualStyleId?: number | null;
    visualStyleName?: string | null;
    toneStyleId?: number | null;
    toneStyleName?: string | null;
    createdAt?: string;
    finishedAt?: string;
};

