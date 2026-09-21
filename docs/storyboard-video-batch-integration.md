# 片段批量视频前端接入（2026-09-21）

入口：项目工作流第四步「片段编辑」左下角「批量生成」。

本次按提供的《片段编辑：批量生成视频前端对接》核对并补齐工作区已有实现。范围为多参视频批次。

## 功能对应

| 功能 | 实现 |
| --- | --- |
| 候选片段 | 请求 candidates，展示缩略图、片段号、摘要、建议时长、视频状态和不可选原因；默认不选，支持全选可选项、选择没有成功版本的片段、清空及刷新，遵守服务端数量上限且最多 50 项。 |
| 统一参数 | type=3 视频模型、模型支持的分辨率、项目画幅、音频、视觉及情绪风格；视频衔接默认开启，始终显式传布尔值。 |
| 时长及编辑稿 | 自动识别、统一覆盖、逐段补填；传入当前页面完整编辑稿，保留空稿供服务端校验。未知手动参考视频支持填写总秒数。 |
| 参考素材 | 复用原参考区保存接口；素材添加、删除或拖入保存期间禁止打开批量生成，批次只使用已保存参考。 |
| 预检与预算 | 参数改变后 350ms 防抖预检，丢弃过期响应；显示逐项原因及费用。仅有效、余额足够且预算已确认时可提交，0 积分合法。 |
| 提交及恢复 | 原样提交成功预览的完整请求和指纹；冻结 clientRequestId、预算及请求，sessionStorage 按用户和分集保存。超时后查询 submission 或原样重发。 |
| 批次历史 | 恢复当前集最近批次，按 beforeId 加载更早记录；shouldPoll=true 时每 4 秒轮询，连续失败 3 次后可手动刷新恢复。关闭弹窗后后台继续。 |
| 候选与产物刷新 | 子项状态或生成记录变化时刷新候选并撤销旧报价确认；当前片段历史随批次变化刷新。进度数值变化本身不重复刷新候选。 |
| 失败重试 | 仅选择 retryable=true 的条目，重新加载修订号并预检；使用新标识和原批次 ID 调用 retry，保留原批次。needsReview 提示先核查原视频。 |
| 隔离及错误提示 | 分集或账号切换后忽略旧响应，即使切回原分集也不接受前次访问的迟到结果；保留原提交恢复记录。稳定错误码对应可操作提示，并保留逐项具体校验原因。 |

## 主要文件

- src/services/storyboardVideoBatch.ts：七个批次接口及类型，复用现有地址前缀和原始 accessToken 鉴权。
- src/services/storyboardVideoBatchErrors.ts：稳定错误码和恢复提示。
- src/pages/aiStudio/project/StoryboardVideoBatchModal.tsx：选择、设置、报价、预算、历史和重试。
- src/pages/aiStudio/project/storyboardVideoBatchPolicy.ts：请求快照、选择及预算校验。
- src/pages/aiStudio/project/useStoryboardVideoBatches.ts：轮询、冻结提交、恢复及访问上下文隔离。
- src/pages/aiStudio/project/ProjectClipEditingStep.tsx：入口、共享编辑稿、参考保存保护和历史刷新。

## 验证

- npm run test:storyboard-video-batch：24 项批量视频回归通过。
- node --test scripts/test-storyboard-video-batch.mjs scripts/test-workflow-media.mjs scripts/test-asset-reference-history-attach.mjs：35 项相关回归通过。
- 批量模块定向 ESLint 检查通过。
- npm run build：TypeScript 检查和生产构建通过；Vite 报告大体积 chunk 提示，不影响构建成功。

测试使用模拟接口，不代表真实后端或供应商联调。未执行数据库迁移、启动或重启服务、调用付费生成。部署前由后端维护人员确认 093 迁移和相应后端版本已就绪。
