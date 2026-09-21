# 项目列表最新媒体

`GET /api/v1/studio/scripts/imports` 的 `data.items[]` 新增以下字段，供项目卡片展示最新图片或视频。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coverFileId` | integer 或 null | 最新可用媒体的文件 ID |
| `coverUrl` | string 或 null | 图片或视频的原始文件地址 |
| `coverType` | string 或 null | `image` 或 `video` |

图片示例（仅列出相关字段）：

```json
{"id": 501, "coverFileId": 102, "coverUrl": "https://media.example/latest.png", "coverType": "image"}
```

视频示例：

```json
{"id": 501, "coverFileId": 103, "coverUrl": "https://media.example/latest.mp4", "coverType": "video"}
```

没有可用媒体时，三个字段全部为 `null`。

前端根据 `coverType` 选择图片或视频组件。视频的 `coverUrl` 是视频文件地址，不是图片缩略图；可用静音、行内播放的视频元素预览。无媒体时显示现有占位内容。

## 选取规则

- 合并本项目的资产图片版本（含角色造型）、所有分集的分镜图片和分镜视频。
- 只选择成功状态 `3`、存在文件、文件类型匹配且地址非空的记录；生成中、失败、取消和文件已删除的记录不参与。
- 按媒体版本或生成记录的 `created_at` 倒序选取，不偏向图片或视频。相同时间按文件 ID 倒序，再按来源和记录 ID 稳定排序。主图切换、审查和旧任务晚完成均不改变版本新旧关系。
- 查询按已鉴权的当前页项目 ID 批量执行，保持普通用户归属限制、管理员跨用户读取、关键词和分页总数。
- 不新增数据库字段或迁移；尚未安装相关媒体表的旧库跳过对应来源，仍返回已有媒体或空封面。

本仓库只包含后端；卡片组件需消费上述字段才能在页面显示媒体。
