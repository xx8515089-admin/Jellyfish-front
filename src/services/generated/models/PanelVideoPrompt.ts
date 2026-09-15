/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { StoryboardPanel } from './StoryboardPanel';
export type PanelVideoPrompt = {
    imageGenerationId: number;
    scope: 'whole_image' | 'single_panel' | 'all_panels';
    panelId?: string | null;
    panelRevision?: number | null;
    modelId: number;
    resolution: string;
    durationSeconds: number;
    prompt: string;
    generationMethod?: string;
    panels?: Array<StoryboardPanel>;
    firstFramePanel?: StoryboardPanel | null;
};

