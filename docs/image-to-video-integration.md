# 独立图生视频接入现状

依据用户提供的 `storyboard-image-to-video-frontend.md`，2026-09-14 对接。

- 图片入口要求成功状态 3 且有输出文件，提交图片历史的 `id` 作为 `imageGenerationId`。
- 使用专用 `imagetovideo/models`、GET `imagetovideo/estimate`、POST `imagetovideo/generate`。
- 提交字段仅为图片生成记录 ID、模型、分辨率、时长、正文和两种可空风格 ID。不上传图片、不追加视频参考素材，不传画幅或音频参数。
- 风格初始为空，选项复用项目已经加载的画面/影调风格列表。
- 时长直接采用模型数组；切换模型保留仍有效的分辨率和时长。
- 报价防抖 300ms，取消旧请求，并按参数键检查有效性；价格失效重新查询，无报价不可提交。
- 生成后保留视频记录和片段 ID，每次详情响应后等待 3 秒再查询；仅状态 3/4 结束。查询失败保留记录，允许重试 GET。
- 用户可以手动同步已存在的供应商任务；关闭弹窗清理轮询，不取消后台任务。
- 成功后刷新片段既有混合媒体历史。弹窗同时播放成功结果。
- 不自动重试生成 POST；网络失败且没有明确业务拒绝时锁定本次弹窗，提示通过任务中心核查。

## 客户端生成与限制

原自动推导的 OpenAPI 文档地址已确认废弃，已移除该默认调用。`pnpm run openapi:update` 需显式配置当前有效的 `OPENAPI_URL` 或 `VITE_OPENAPI_URL`，未配置时不会发送请求；完整在线契约尚未核对。

当前依据附件制作最小 OpenAPI 子集 `docs/contracts/image-to-video.openapi.json`，通过 openapi-typescript-codegen 生成 `ImageToVideoService` 及四个 DTO。生成服务复用项目已有 `generated/core/OpenAPI` 与 `request`，沿用登录头和 baseURL，没有复制独立鉴权配置。

该子集只包含本入口消费的字段，不是后端完整 OpenAPI。后端文档恢复后需同步核对。现有全量生成命令可能移除该子集客户端，届时应确认完整规范已包含独立接口。

复现子集生成：

```powershell
node node_modules/openapi-typescript-codegen/bin/index.js --input docs/contracts/image-to-video.openapi.json --output .tmp-image-to-video-client --client fetch --useOptions --useUnionTypes
Copy-Item .tmp-image-to-video-client/models/*.ts src/services/generated/models/
Copy-Item .tmp-image-to-video-client/services/ImageToVideoService.ts src/services/generated/services/
```

验证：`node scripts/test-image-to-video-contract.mjs` 与 `node node_modules/typescript/bin/tsc --noEmit`。未启动服务、提交收费任务或执行后端迁移；真实模型及账单验收仍需联调。
