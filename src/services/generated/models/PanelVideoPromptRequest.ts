/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PanelVideoPromptRequest = {
    imageGenerationId: number;
    scope: 'single_panel' | 'all_panels';
    panelId?: string;
    panelRevision: number;
    modelId?: number;
    resolution?: string;
    durationSeconds?: number;
};

