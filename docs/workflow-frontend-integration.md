# 前端工作流优化接入状态

本次按 `workflow-backend-api.md` 配合后端工作流更新，保留原有资产生成与独立图生视频链路。

多参生图补充契约：`images/generate` 显式提交当前参考图 `referenceFileIds`，选中分镜大师时附加 `skillCode: "storyboard-master"`，未选中时省略该字段。提交后以响应 `data.id` 调用 `images/detail?id=...` 独立轮询；状态 1/2 继续等待，状态 3 且存在产物后刷新历史并补入详情结果，其他终态停止查询。activeTasks 仅用于发现和恢复图片任务，不再作为图片生成进度的定时查询接口。

## 当前实现

- 历史图片/视频支持原生拖拽到参考素材区。开始拖拽时仅参考行替换为投放区；Escape、无效投放或拖拽结束恢复原布局。投放后读取 `videos/references/options?source=history`，使用匹配 outputFileId 的候选类型、文件 ID 及参考修订调用既有 references/add。直接引用已上传产物，无需重新上传文件；重复项不再次添加，多参生图区拒绝视频参考。添加完成刷新片段详情，期间显示添加状态并阻止重复提交。

- 生成期间点击历史缩略图优先预览所选记录，轮询继续；当时运行的任务完成后不会抢占手动选择。可点击“查看生成进度”返回占位画面。新提交的任务仍会显示生成占位。

- 图片和视频生成期间，中央预览显示生成占位、详情接口返回的 statusName 和 progress。按媒体类型及生成记录 ID 独立查询 images/detail 或 videos/detail；进度 100% 不代表产物已就绪。成功且产物可用后刷新历史并自动选择新结果，失败终态停止查询并显示错误。activeTasks 用于发现及恢复任务。

- 分集按 ID 关联，保存完整的 `id/title/rawText/expectedRevisionNo`。同分集保存排队执行，后续请求使用前一次成功返回的修订号。缺少修订号时读取详情并检查基线，避免把旧稿直接覆盖到新版本。
- 版本冲突保留本地标题和正文，展示服务器内容供人工合并；确认合并只更新本地稿，仍需显式保存。下一步先保存并检查期间是否又发生编辑；下游锁定继续服从 `canEdit`。
- 普通图片、视频提交持久化账号隔离的 `clientRequestId`、原参数及语言。网络不确定或 HTTP 500 保留凭据，可查询提交或原样重试；不自动创建新的计费请求。
- 已访问片段各自维护 activeTasks 轮询。仅状态 1/2 且 `shouldPoll=true` 继续查询；后台标签暂停定时轮询，回到前台恢复。状态 6 停止自动轮询，展示人工核查提示。
- 历史改用每页 20 条的游标接口，按媒体类型与生成 ID 去重。进度百分比变化不会反复刷新历史；任务增删或状态变化刷新第一页。列表更新尽量按 itemKey 保留已选媒体。
- 缩略图可见时加载带鉴权的后端 JPEG；支持 202/503 重试间隔、Blob URL 释放。历史和任务查询支持 ETag/304，并按认证身份隔离缓存。
- 普通图片积分改用分镜图片估算 POST，带质量、比例、数值分辨率及风格 ID；视频估算包含 segmentId、音频能力、继承上段设置。估算防抖且丢弃过期响应，积分不足时禁用生成。图片参考参数省略时，报价和提交均采用后端保存的参考选择。
- 风格选项保存 ID，“无风格”传 null，不自动继承项目风格名称。历史详情按打开时查询，缩略图切换不等待详情接口。

## 当前边界和验证

- 普通工作流接口由 `docs/contracts/workflow.openapi.json` 文档契约生成客户端。二进制缩略图和条件 GET 由使用 generated core 鉴权配置的专用传输处理，避免通用 JSON 客户端把 304 当错误。
- 原自动推导的 OpenAPI 地址已确认废弃，已移除该默认调用。同步脚本只接受显式配置的 `OPENAPI_URL` 或 `VITE_OPENAPI_URL`，未配置时在发送请求前退出。尚未完成在线契约核对和真实计费联调。
- 独立图生视频沿用自身接口和状态，不擅自使用普通图片/视频的提交幂等契约。
- 刷新历史第一页会重置该片段已展开的分页；用户可重新加载更多。尚未实现跨刷新恢复所有曾访问片段的轮询列表。
- 原媒体预览仍使用现有可访问产物 URL，未将视频整体转为 Blob，也未接入需要鉴权代理支持的 content Range 播放。
- 未自动启动服务。回归命令：`node --test scripts/test-workflow-media.mjs scripts/test-image-to-video-contract.mjs scripts/test-asset*.mjs scripts/test-episode-assets-generation-status-polling.mjs`；类型检查：`node node_modules/typescript/bin/tsc --noEmit`。
