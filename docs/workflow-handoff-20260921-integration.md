# 工作流可靠性前端接入（2026-09-21）

依据 Downloads/workflow-frontend-handoff-20260921.md，与已接入的画布、导演台、资产导入和分镜批量视频能力并存。

## 实现范围

- `src/services/workflowSubmissions.ts`：8 类工作流提交在网络发送前持久化 clientRequestId、原 JSON、language、账号、项目及业务对象。使用共享 Web Locks/IndexedDB 操作锁；未知结果和冲突保留原记录并阻止直接新建同对象提交。
- `src/services/generated/core/request.ts`：只拦截文档列出的 8 个 POST。普通图片/视频及批量视频继续使用原提交入口。请求体在异步鉴权前复制，发送前检查账号。
- `src/components/WorkflowRecovery.tsx` / `src/App.tsx`：有相关记录时显示“操作记录”，支持原凭据查询和未知操作按原参数重试。首次 response 与当前业务 current 分开保存；恢复根据不同业务的生成 ID、taskIds、lookId 或分集数组查询，避免统一解析 taskId。切换页面后的旧结果不写入新页面。
- 资产去油和提取重试新增服务方法 `StudioAssetGenerationApi.requestDeOil` / `StudioScriptsApi.retryAssetExtraction`。当前页面原本没有这两个按钮，因此没有凭文档新增产品入口；以后调用这两个方法同样经过持久化和幂等处理。
- `studioDubbing.ts` / `StoryboardDubbingPanel.tsx`：生成直接发送完整 input，冻结最终角色、音色、语言、台词、情绪、音量、语速。独立保存动作保留。历史记录显示其 input，不使用当前编辑内容替代。
- `ImageToVideoModal.tsx` / `useWorkflowMedia.ts` / `workflowMediaPolicy.ts` / `ProjectClipEditingStep.tsx`：依照 shouldPoll/pollAfterSeconds 调度；状态 6 和 7 不继续自动轮询。产物操作要求 outputReady=true；成功但无产物不无限等待。不根据进度 100 推断成功，不在前端推断退款。
- `storyboardExport.ts` / `StoryboardExportModal.tsx`：弹窗打开时刷新分集、片段序号，提交冻结原请求，ZIP 仅附加预检 snapshotToken。缺少 token 停止；JSON 错误、无效 ZIP、可比较的长度不一致均不保存。账号切换停止下载，取消或失败保留选项。未解析 snapshotExpiresAt 为 UTC。
- `scripts/patch-workflow-client.mjs`：openapi:gen 和 openapi:update 完成生成后恢复工作流包装，防止代码生成抹掉提交保护。

## 本地记录

localStorage 键为 `workflow-operations:<account>:<clientRequestId>`。内容含 account、project、context、object、operation、clientRequestId、body、language、url、createdAt、state，以及受理后的原 response、最后查询的 current/checkedAt。存储失败时不发送 POST；没有原账号不能重放。这里只记录请求和业务结果，不保存鉴权 token。

明确拒绝仅识别 acceptance=rejected 且错误码属于 WORKFLOW_INVALID_REQUEST、WORKFLOW_REQUEST_REJECTED、WORKFLOW_STORAGE_NOT_READY。401、非结构化 502/503、超时、找不到凭据均保留未知状态；冲突需 IDEMPOTENCY_CONFLICT 和 acceptance=conflict 同时成立。

## 验证

运行以下自动化回归（91 项）与生产构建：

```text
node --test scripts/test-workflow-handoff.mjs scripts/test-storyboard-export.mjs scripts/test-storyboard-dubbing-contract.mjs scripts/test-workflow-media.mjs scripts/test-image-to-video-contract.mjs scripts/test-asset-look-generation-task.mjs scripts/test-storyboard-video-batch.mjs scripts/test-asset-import-contract.mjs
pnpm run build
```

测试覆盖 8 类响应形状、持久化先于 POST、断网后重载恢复、查不到凭据不新建提交、语言/数组顺序不变、账号切换、存储失败、并发点击、旧凭据与当前详情分离、媒体轮询/就绪矩阵、导出请求冻结、缺失 token、JSON 错误、截断下载和快照冲突，并回归批量视频及资产导入协议。

## 尚需环境联调

没有启动项目服务、触发付费生成或执行数据库迁移。后端 sql/099-workflow-reliability.sql 及接口部署状态未核验。文档 A01–A20 中供应商执行、计费/退款、真实多标签页、网络故障注入、浏览器页面草稿与所有旧异步回调的验收不能由这些单元测试替代，需要在测试环境完成。现有分镜格检测继续使用后端兼容的单一查询参数入口。
