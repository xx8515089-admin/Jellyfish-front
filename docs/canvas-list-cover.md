# 自由画布列表最新媒体

`GET /api/v1/studio/canvases/list` 的 `data.items[]` 在保留原字段的基础上，返回本画布最新的一条图片或视频，供列表卡片预览。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `coverAssetId` | integer 或 null | 画布素材关联 ID |
| `coverFileId` | integer 或 null | 底层文件 ID |
| `coverUrl` | string 或 null | 原始媒体地址，私有存储可能为空 |
| `coverType` | string 或 null | `image` 或 `video` |
| `coverContentUrl` | string 或 null | 需要 `Authorization` 登录头的媒体读取接口 |

示例（仅列出相关字段）：

```json
{
  "canvasId": 501,
  "coverAssetId": 103,
  "coverFileId": 206,
  "coverUrl": "https://media.example/latest.mp4",
  "coverType": "video",
  "coverContentUrl": "/api/v1/studio/canvases/assets/content?canvasId=501&assetId=103"
}
```

## 选取规则

- 上传、关联、复制以及已保存的生成结果，统一从本画布素材中选择。
- 图片与视频共同按素材关联 `created_at` 倒序排序；时间相同时按关联 ID 倒序，每个画布只取一条。
- 已移除素材、音频、文件元数据缺失，以及媒体地址和存储键都为空的记录不参与。仅检查元数据，不在列表请求中访问远程存储；实际文件读取仍可能失败。
- 私有媒体有存储键时也参与排序，`coverUrl` 可以为空，使用 `coverContentUrl` 鉴权读取。
- 没有可用媒体时，五个封面字段全部为 `null`。
- 只批量查询已鉴权的当前页画布，不改变关键词、分页、归属权限与管理员范围。不新增数据库表或字段。

## 前端接入

根据 `coverType` 选择图片或视频组件。视频的 `coverUrl` 是视频地址，可使用静音、行内播放的视频元素展示预览，不能直接作为图片地址使用。

优先使用可访问的 `coverUrl`。地址为空或需要鉴权时，使用项目已有的媒体加载器携带登录头请求 `coverContentUrl`；该接口支持 Range。若以 `fetch` 获取 Blob 再创建对象 URL，组件销毁时应释放对象 URL。不要在地址查询参数中拼接 token。

刷新列表即可取得最新媒体，不需要逐个请求画布详情或全部素材。示例客户端已提供 `CanvasSummary` 和 `listCanvases()`。

本仓库只包含后端及接入示例；实际卡片组件需要消费上述字段才能显示图片或视频。
