/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectSceneLinkRead = {
    /**
     * 关联行 ID
     */
    id: number;
    /**
     * 项目 ID
     */
    project_id: string;
    /**
     * 章节 ID（可空）
     */
    chapter_id?: (string | null);
    /**
     * 镜头 ID（可空）
     */
    shot_id?: (string | null);
    scene_id: string;
    /**
     * 场景缩略图下载地址
     */
    thumbnail?: string;
    /**
     * 场景 FRONT panorama 下载地址
     */
    panorama_thumbnail?: string;
    /**
     * 场景 3x3 机位板下载地址
     */
    camera_board_thumbnail?: string;
    /**
     * 场景 FRONT panorama file_id
     */
    panorama_file_id?: string;
    /**
     * 场景 3x3 机位板 file_id
     */
    camera_board_file_id?: string;
};

