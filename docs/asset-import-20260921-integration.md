# 素材批量导入 2026-09-21 接入记录

依据下载目录 `asset-import-backend.md`，对照现有清单导入和批量图片上传实现更新。附件引用的独立 OpenAPI JSON 未在下载目录提供；本次在仓库现有 `docs/contracts/asset-import.openapi.json` 上按文档明确的路由和参数位置修订，再运行 `scripts/generate-asset-import-client.mjs` 生成客户端，保留原有 DTO，其余字段以后端实际契约联调为准。

## 已接入

- 八个接口均使用 `/api/v1/studio/assetLibrary` 前缀，不再将 batchId 放入 URL 路径。详情与条目使用 query，预览/提交/重试使用 JSON，上传使用 multipart 的 batchId/file/clientItemId 普通字段。
- batchId 契约包含必填、非空白和最长 64 字符约束；分页保留 pageSize 1–100。
- 复用既有 OpenAPI.BASE、原始 Authorization accessToken、language、基础路径拼接和请求取消机制。客户端不硬编码 Bearer 或额外重复拼接 /jellyfish。
- 保留 201 创建、202 提交/重试的成功响应处理。
- 新增导入专用传输桥，保留 HTTP status、正文、顶层及 data.errorCode 和 Retry-After。429 按响应头等待，未提供时按 3 秒处理；同账户等待期限内不重复发请求。状态轮询遇到 429 按等待时间继续。
- prepare 使用模板接口返回的文本字节数、单文件大小、图片数量及批次字节限额。CSV/TSV 记录行号、多行字段、像素与图片真实格式等仍由后端权威解析，不在前端用换行数替代 CSV 记录数。
- 同一文件条目使用 SHA-256 识别内容变化。网络失败后复用原上传幂等键；同 clientItemId 改变字节时要求重建草稿，不能静默沿用原文件。使用上传返回的最新 revision 并清空旧预览。
- 预览令牌与 revision 原样提交；未确认命令保留幂等键和请求体。待确认时不准备新批次或覆盖旧重试命令。401/403 不清除不确定的原提交。
- retry 前重新查询条目，仅允许服务端 failed 且 retryable=true 的项；新重试命令生成新键，丢失响应后的同命令恢复继续使用原键。
- 现有逐页结果读取、逐行错误、演员/场景/道具列表刷新、无封面占位和 customTags 展示继续沿用。

## 验证

- `node --test scripts/test-asset-batch-operations.mjs scripts/test-asset-import-contract.mjs`：17 项通过。
- 覆盖真实组件处理流程、重复点击、创建/上传/提交丢失响应、分页错误、八路由参数位置、动态限额、文件不可变、不可重试项拦截、429 响应头和等待期不重复请求。
- `pnpm build`：TypeScript 与 Vite 生产构建，日志 `artifacts/asset-import-build.log`。
- 生成脚本保留专用传输桥，后续再生成客户端不会丢失退避处理。

本次未启动服务、执行 094 迁移、调用真实批量写入或部署。真实 MySQL、R2、本地存储、多实例队列和图片解码联调仍由后端部署后的环境验证。前端关闭导入弹窗只停止本地轮询，不调用后台取消接口；现有弹窗会话恢复仍限当前未销毁的会话，未新增跨设备批次管理页。
