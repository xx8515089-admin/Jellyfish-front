# 自由画布 V3 前端接入

依据用户提供的 `tapnow-canvas-api-v3.md`（2026-09-16）。接口前缀沿用 `/api/v1/studio/canvases`，继续复用项目请求封装和登录鉴权，不增加供应商凭据。

## 已接入

| 范围 | 行为 |
| --- | --- |
| 能力与目录 | 保留 V2 媒体流程；分别根据 `textTasksReady`、`libraryPublishReady` 开放文本与入库；读取 `/tasks/capabilities`、`/tasks/models`。文本目录失败不阻止媒体画布加载。 |
| 四类媒体节点 | 角色/场景图片、角色/场景视频复用服务端生成、报价和批次。保存 `/settings/model` 绑定及描述节点参考图。 |
| 多图引用 | 应用图片任务时保存 `settings.imageUrls`、`selectedImageIndex` 和对应素材绑定。视频引用不从旧本地历史猜测选图。 |
| P0 文本 | 描述增强、过滤、角色/场景提取、分镜拆分、分镜汇总使用独立 `/tasks` 接口。模型保存为后端 ID；仅处理文字。 |
| 文本提交流程 | 保存修订 → 报价 → 展示预留积分 → 用户确认 → 提交或恢复回执 → 按 `shouldPoll` 查询 → 预览/确认应用 → 再次保存。报价过期或价格变化时不自动重新报价提交。 |
| 文本结果 | 核对画布、节点、修订、模型和输入摘要；跨设备恢复时读取冻结修订。输入发生变化需确认，确认期间的新编辑不被覆盖。镜头按稳定 ID 匹配，表格与镜头结果同步。 |
| 图片入库 | 控制栏“图片入库”，以及云端“创建角色/场景”节点进入选图、服务器初筛、入库流程。返回真实库条目与来源记录，不创建供应商角色身份。 |
| 批次历史 | V3 通过 `/batches/list` 加载服务端分页摘要和状态筛选，点击后读取详情；V2 保留旧兼容路径。 |

## 幂等与费用

- 文本、初筛、入库发送前保存请求标识及参数；本地持久化失败时停止提交。
- 网络结果不确定时保留原请求。查询原回执；明确“回执不存在”时仅重放原参数，不生成新标识。
- 回执查询失败（包括权限错误）不丢弃尚未确认的文本/入库请求。
- 文本重试使用画布 `taskId`，重新获取与原输入摘要一致的报价；不使用通用 `generationTaskId`。
- 按服务端 `actions` 显示取消、重试、结算重试；文本没有补拉供应商结果的入口。
- 预留积分与实际费用分开显示。`actualCredits=null` 显示待核算；零预留不表示免费。
- 入库需要服务端 `canPublish=true`，并绑定同一张图片与审核记录。初筛未确认时不能发起新标识的重复识图。

## 代码位置

- `src/services/studioCanvases.ts`、`studioCanvasV3Types.ts`：接口和类型。
- `canvasCloud.js`：绑定、持久提交、回执恢复。
- `canvasTextTasks.js`、`useCanvasTextTasks.jsx`：文本输入、结果映射、确认与历史。
- `useCanvasLibraryPublish.jsx`：选图、初筛、入库和恢复。
- `components/CanvasBatchHistoryV3.jsx`：服务端批次分页和详情。

## 验证

```sh
node --test scripts/test-canvas-cloud.mjs scripts/test-canvas-cache.mjs scripts/test-canvas-save.mjs scripts/test-canvas-character-library.mjs scripts/test-canvas-wheel.mjs scripts/test-canvas-v3.mjs scripts/test-canvas-v3-ui.mjs
npm run build
```

新增测试覆盖中文和空格节点 ID、数值镜头 ID、多图绑定、文本模型数值 ID、报价/余额检查、超时回执恢复、输入编辑冲突、结构化结果应用、初筛准入及真实入库标识。

本次未启动项目服务，未执行数据库迁移或真实供应商调用。线上联调仍需确认服务端已完成 V3 迁移、报价/模型路由配置以及实际错误码和回执响应。附件没有给出“文本回执不存在”和“初筛回执不存在”的完整错误码枚举；前端仅对明确识别的不存在错误重发，未知错误保留请求并显示失败，避免无依据地重复计费。

视频分析、音频转写、供应商身份和图像变体/放大、通用供应商聊天仍未作为 V3 云端操作开放；本地模式保留原流程。云端遮罩生成会明确提示不支持。
