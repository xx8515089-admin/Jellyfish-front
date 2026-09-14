/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ImageToVideoGenerate = {
    imageGenerationId: number;
    modelId?: number;
    resolution?: string;
    durationSeconds?: number;
    prompt: string;
    visualStyleId?: number | null;
    toneStyleId?: number | null;
    scope?: 'single_panel' | 'all_panels';
    panelId?: string;
    panelRevision?: number;
};

