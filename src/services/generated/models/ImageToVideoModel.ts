/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ImageToVideoModel = {
    id: number;
    name: string;
    modelCode: string;
    defaultModel?: boolean;
    resolutions: Array<string>;
    durationSeconds: Array<number>;
    maxPromptCharacters: number;
    minImageWidth?: number;
    minImageHeight?: number;
    maxImageBytes?: number;
};

