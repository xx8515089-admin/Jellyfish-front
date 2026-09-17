# 自由画布全节点接口审计与后端开发需求（v3 建议稿）

> 后续审计：V3 已实现的功能不再列为待开发。最新剩余缺口及视频分析建议契约见 [V3 后续接口缺口与后端开发清单](./free-canvas-backend-api-development-v4.md)。

更新日期：2026-09-16。用途：后端评审、排期、接口设计与前后端联调。

> 本文依据当前前端源码、后端提供的 `tapnow-canvas-api-v1.md` / `tapnow-canvas-api-v2.md`、仓库 OpenAPI 与业务服务封装进行静态审计。未连接真实后端、未调用付费模型。“已接入”仅表示前端存在调用链；“缺少接口”表示当前可见契约未覆盖，不断言服务端代码绝对不存在。下文所有标为“建议”的路径、枚举和 JSON 都是待评审的新契约，不能当作现有接口直接调用。

## 1. 核心结论与优先级

1. 基础画布保存、素材、普通图片/视频、镜头生成、批次和历史恢复已有 v2 调用链，**不需要重新开发整套接口**。
2. 角色/场景图片、视频四类专用节点未完整接入：按钮进入统一入口后，被云端节点白名单拒绝；保存模型绑定、批次枚举也未覆盖它们。需要先统一节点执行契约，再补前端适配。
3. 角色/场景描述仅接入文本模型目录，增强/过滤无云端执行契约。小说提取、分镜文字处理、视频分析仍是旧供应商直连，不能按云端可用交付。
4. “创建场景”当前复用了 Sora 创建角色接口，是业务语义错误；业务角色/场景资产与供应商角色身份必须分开。
5. 图像对比、预览、文本编辑、普通关键帧提取等是本地能力，不应列成必须新增的后端接口。

| 优先级 | 工作包 | 主责与结果 |
| --- | --- | --- |
| P0 | 四类角色/场景媒体节点适配 | 前后端共同确认别名或标准化方案，前端补模型绑定、输入和结果回填 |
| P0 | 文本任务统一执行 | 后端提供描述增强/过滤、小说提取、分镜拆解/汇总任务；前端迁移直连 |
| P0 | 创建角色/场景语义修正 | 明确“入业务资产库”与“创建供应商身份”；前端停止混用 |
| P1 | 视频多模态分析、口播转写 | 后端提供受控媒体分析任务及能力目录；前端迁移旧 Chat 请求 |
| P1 | 高级媒体能力 | 首尾帧、遮罩、扩图、供应商身份等按真实模型能力开放 |
| P1 | 批次列表及报价契约定稿 | 后端补完整列表/分页，并明确现有报价响应；前端去掉猜字段 |
| P2 | 整图执行 | 仅在要求自动沿连线运行时建设，当前批次不等于整图调度 |

## 2. 全部节点功能矩阵

状态：A 已有调用链；B 已有接口但前端漏接；C 当前画布契约缺失/需扩展；D 本地功能无需专用云接口；E 有相邻业务接口，必须确认语义后复用。

| 节点类型 / 名称 | 功能拆分 | 状态与审计结论 | 应做工作 |
| --- | --- | --- | --- |
| `input-image` 图片输入 | 上传、拖放、粘贴、作为参考图 | D+A：本地读图；云保存时上传和建立素材绑定 | 复用 assets/upload/content；不新增“图片输入生成”接口 |
| `text-node` 文字节点 | 编辑、向普通生成节点提供文字 | D+A：工程正文保存，服务端已有普通文字输入解析 | 无专用执行接口需求 |
| `novel-input` 小说输入 | 编辑/导入小说；提取角色场景 | 编辑 D+A；提取 C+E，触发提取节点旧 Chat 流程 | 复用通用文本任务；不可把文本编辑算作 AI 任务 |
| `extract-characters-scenes` 提取角色场景 | 选择文本模型、结构化提取、创建后续节点 | 模型目录 B；提取 C+E；创建节点 D | 迁移 type=1 目录；提供结构化输出，创建连线仍由前端完成 |
| `character-description` 角色描述 | 模式/风格/参考图；增强、过滤 | 编辑 D+A；type=1 模型目录 A；文本执行 C，云端按钮已禁用 | 增加 promptEnhance / promptFilter；校验 textModelId |
| `scene-description` 场景描述 | 同上，增强需去除人物描述 | 同上 | 同一接口区分 subjectType=scene，不能写死角色提示词 |
| `generate-character-image` 生成角色图片 | 描述/参考图输入、出图 | B+C：进入 startGeneration 后被 useCanvasCloud 白名单拒绝，模型绑定缺失 | 见工作包 G1；基础 imageGenerate 可复用 |
| `generate-scene-image` 生成场景图片 | 描述/参考图输入、出图 | B+C，同上 | 同上，保留场景来源 |
| `generate-character-video` 生成角色视频 | 描述/所选图片输入、视频 | B+C，同上；旧 UI 还依赖本地 history 取图/状态 | 补云端输入冻结、任务状态与结果回填 |
| `generate-scene-video` 生成场景视频 | 描述/所选图片输入、视频 | B+C，同上 | 同上 |
| `create-character` 创建角色 | 从视频时间段创建 Sora 身份 | C：旧 `/sora/v1/characters` 直连；非业务资产库创建 | 若保留供应商身份，提供服务端受控注册；若目标为资产入库，改业务流程 |
| `create-scene` 创建场景 | 当前亦调用 Sora characters 并读取 username | C+E：语义错误，不是场景入库 | 走场景资产发布，禁止把供应商角色ID当场景ID |
| `video-input` 视频输入/关键帧整理 | 视频导入、手动/自动/智能抽帧、口播提取 | 输入/抽帧 D+A；口播 C，旧 Chat 多模态请求 | 抽帧无需强制后端化；口播需真实音频输入与时间戳契约 |
| `video-analyze` 视频拆解/提示词反推 | 按帧组分析、整段视频分析、结果转节点 | 分析 C，旧 Chat 直连；结果转节点 D | 视频/帧组任务、结构化镜头结果与模型能力 |
| `storyboard-node` 智能分镜表 | 表格编辑/导入；LLM 拆解/汇总；镜头生成/批量 | 编辑 D；文字处理 C+E；镜头 image/video 与批次 A | 文本部分迁移；媒体部分复用 v2，不重复开发 |
| `gen-image` AI 绘图 | 普通文字/参考图生成；高级图像编辑 | 基础 A；遮罩、专用 MJ 动作等 C | 按 operation/能力区分开放，不能将整个节点称为未接入 |
| `gen-video` AI 视频 | 基础图文生视频；首尾帧/专用路由 | 基础 A；首尾帧、身份、视频参考及 Wan/HappyHorse 专用路由 C | 扩展 referenceRoles/inputPorts 与执行适配 |
| `image-compare` 图像对比 | 本地图像比较 | D+A：素材读取复用鉴权接口 | 不新增 AI 接口 |
| `preview` 预览窗口 | 展示素材、作为已保存结果输入 | D+A | 复用 content/download，不需要生成接口 |
| `local-save`（兼容 `save-to-local`）保存到本地 | 连接本机服务、批量写文件、自动保存 | D：依赖本机 `/ping`、`/save-batch` 等，非云端接口 | 未安装本机助手不能靠云 API 写任意本机目录；可用浏览器下载降级 |
| `expand-image` 扩图（额外旧分支） | MJ imagine、轮询、modal 扩图 | C：源码存在独立旧分支，不在当前主添加菜单中 | 保留则纳入 imageOutpaint；删除旧入口也是产品可选方案 |

注：`desc-model`、`extract-model`、`analyze-model`、`role-image-model` 等是下拉菜单状态，不是实际节点类型。侧栏 Chat、角色库、提示词库属于跨节点辅助能力，见第 7 节。

## 3. 已有接口与复用边界

统一画布前缀：`/api/v1/studio/canvases`。原始 token 鉴权沿用项目约定，不能使用供应商 API Key 代替登录 token。

| 既有接口组 | 已有前端覆盖 | 不应重复建设的部分 |
| --- | --- | --- |
| capabilities、create/list/detail/save/rename/delete、revisions/restore/copy | 云画布生命周期、修订与保存冲突 | 工程正文和普通节点编辑的持久化 |
| assets/upload/attach/attachLibrary/submission/list/remove/content/download | 素材、业务封面来源、回执找回、授权读取 | 普通媒体上传、下载；是否有某个入口仍须按具体 UI 判断 |
| models | 图片/视频能力目录与模型设置 | 供应商信息、模型参数，不返回密钥 |
| generations/costEstimate/create/detail/list/submission/cancel/retry/sync/retrySettlement | gen-image/gen-video、分镜镜头、历史恢复 | 基础异步任务生命周期、费用状态、结果补拉 |
| batches/costEstimate/create/detail/submission/cancel/retryFailed | 批量独立任务 | 已有批次提交和取消；缺的是完整列表及部分契约定稿 |
| `/api/v1/studio/models?type=1` | 最近接入角色/场景描述选择器 | 文本模型目录可供提取/分镜/分析迁移，但不保证每个文本模型支持视频/图像 |
| `/api/v1/studio/assetLibrary/items`、画布 attachLibrary | 角色、场景、道具搜索和封面关联 | 读取资产不是创建资产，sourceLinkId 不是供应商身份 |

### 3.1 相邻业务接口：有能力不等于直接兼容

- `POST /api/v1/script-processing/divide-async`（同步 divide 亦存在）：接收 script_text，write_to_db 默认为 false；可以评估复用分镜算法。但当前请求没有画布 modelId、nodeId、revisionNo 和计费绑定，返回结构也须转换到画布 shots，不能宣称只改 URL 就接通。
- `POST /api/v1/script-processing/extract-async`：要求 project_id、chapter_id、script_division。独立自由画布不一定具有这些业务 ID，不能伪造 project/chapter。建议服务端复用内部提取算法，提供画布适配入口。
- `optimize-script(-async)` 是剧本一致性优化，不能当成通用描述增强/过滤。
- `POST /api/v1/studio/assetLibrary/items` 的现有保存请求要求业务 assetId、imageVersionId。画布 assetId 属于另一套 ID；不可直接传入。
- `/api/v1/studio/storyboards/videos/prompts/regenerate` 等依赖业务分镜上下文，应复用算法或新增画布适配，不能混用镜头 ID。
- 仓库 LlmService 的 provider/model 管理与 dry-run 不等于正式计费文本任务接口。

## 4. 后端工作包与建议契约

### G1：角色/场景媒体节点标准化（P0）

优先复用 imageGenerate / videoGenerate，不新增四套供应商调用。

建议方案：后端识别四个节点别名，并在 models.supportedNodeTypes 返回真实支持范围。图片取 settings.prompt，视频取 settings.videoPrompt；补充从已保存描述节点读取 prompt/referenceImages 的规则。选中的上游图片必须绑定到当前冻结修订的明确 assetId，不能在执行时临时读取“最新历史”。

替代方案：前端持久化为标准 gen-image/gen-video，额外保留业务外观标记。此方案可减少后端修改，但需要迁移旧工程类型、连线和结果显示；不得仅提交时改字符串而保存仍为旧类型。

前端必须同步改：useCanvasCloud.generate 白名单、canvasCloud.prepare 的模型绑定、批次枚举、角色场景节点本地 history 依赖、result 应用，以及描述与参考图的归一化。当前 startGeneration 云端分支没有使用传入的 prompt/sourceImages/大部分 options，故仅“放宽白名单”仍不够。

验收：四种节点分别保存→报价→生成→刷新恢复→应用结果；所选图片变化后旧任务输入不变；不同 nodeId 的结果不串写。

### G2：统一文本和分析任务（P0/P1，建议新增）

建议前缀 `/api/v1/studio/canvases/tasks`，与现有 generations 并行；若后端选择扩展 generations，也必须版本化扩展 operation、输出类型和历史，不能让旧客户端把文本结果当媒体素材。

| 方法 / 建议路径 | 请求关键字段 | 返回/语义 |
| --- | --- | --- |
| POST /tasks/costEstimate | 与 create 相同的执行输入 | quoteId、expiresAt、预留积分、余额及足额标记 |
| POST /tasks/create | canvasId/revisionNo/nodeId、operation/modelId、parameters、clientRequestId、quoteId | taskId、状态、输入摘要、计费状态 |
| GET /tasks/detail | canvasId、taskId | 状态、进度、结构化结果、错误、actions、shouldPoll |
| GET /tasks/list | canvasId、nodeId/operation/status、page/pageSize | 分页历史，包含文本结果概要 |
| GET /tasks/submission | canvasId、clientRequestId | 原提交回执；明确 NOT_FOUND 与仍在受理 |
| POST /tasks/cancel | canvasId、taskId | 取消意图；不承诺供应商已停止 |
| POST /tasks/retry | canvasId、taskId、新 clientRequestId、quoteId | 新任务并关联原任务，避免原标识重复扣费 |

示例（建议）：

```json
{
  "canvasId": "101",
  "revisionNo": 12,
  "nodeId": "desc-1",
  "operation": "promptEnhance",
  "modelId": 7,
  "parameters": { "subjectType": "character", "mode": "image" },
  "quoteId": "quote-101",
  "clientRequestId": "text-unique-request"
}
```

执行正文从该 revisionNo 的节点字段及合法输入连线解析；请求 parameters 仅接收操作允许的选项，不允许任意 baseUrl、apiKey、HTTP 模板。若允许直接传 text，必须明确它优先于哪个字段，并冻结哈希，禁止两套输入悄悄不一致。

| 建议 operation | 输入与必须明确的边界 | 建议结构化结果 |
| --- | --- | --- |
| promptEnhance | 描述文本、subjectType、image/video 模式、可选风格 | `{text}`；场景不混入人物，角色保留身份 |
| promptFilter | 描述文本、subjectType、明确过滤规则版本 | `{text}`；规则版本可追溯 |
| extractCharactersScenes | 小说/文本输入、分段与最大长度策略 | `{characters:[{id,name,role,age,gender,description,appearance}],scenes:[{id,location,description,mood,style}]}` |
| storyboardSplit | script/novel/custom 模式、原文、经校验的模板文本 | `{shots:[{id,prompt,description,tags,camera,duration}]}`；稳定 ID |
| storyboardPromptMerge | 表格行稳定 ID、各列及行上下文 | `{rows:[{rowId,prompt}]}`；不得按返回顺序错配 |
| videoAnalyze | video assetId 或 frame assetIds + timestamps，模式/语言 | `{shots:[{id,startSeconds,endSeconds,description,prompt,camera}]}` |
| speechTranscribe | 视频/音频 assetId、语言、时间范围 | `{language,segments:[{startSeconds,endSeconds,text}]}` |

结果 envelope（建议）：taskId、canvasId、revisionNo、nodeId、operation、modelId、status、progress、shouldPoll、actions、inputHash、result、billing、error、createdAt/updatedAt。status 建议 queued/running/succeeded/failed/canceled；最终枚举与现有工程风格一起定稿。进度未知可为 null。billing 至少 reservedCredits、settledCredits、state；未知费用为 null，不能默认为 0。

服务端校验结构化结果，拒绝无法解析的伪 JSON；前端只在用户应用时修改节点并 save，后台任务不覆盖当前工程。用户编辑、删除、重排节点后仍可看历史，但不能静默覆盖新内容。

### G3：模型能力目录扩展（P0）

现有 type=1 可提供模型列表，但无法证明视觉/音频/结构化输出能力。建议扩展画布 models 的 operation 范围，或新增只读任务模型目录，返回：modelId、supplierId/name、operation、supportedNodeTypes、available/unavailableReason、inputModalities（text/image/video/audio）、outputSchemaVersion、输入长度/时长/帧数上限、supportsCancellation、计费规则。

现有图片/视频目录保持向后兼容。modelId 必须引用模型管理，不按供应商名字拼接临时配置。默认模型也必须满足本操作能力；禁用或删除后禁止新提交，历史保留快照。目录永不返回供应商凭据。

### G4：业务资产入库与供应商身份（P0/P1）

**A. 业务入库建议：** `POST /assets/publishLibrary`，请求 canvasId、revisionNo、nodeId、canvasAssetId、assetType（1角色/2场景/3道具）、name、description/prompt、clientRequestId。后端从有权限的画布素材创建必要的业务资产/图片版本，再调用现有库保存逻辑。返回 libraryItemId、业务 assetId/imageVersionId、sourceLinkId（若同步关联）、操作回执。补 submission 找回，可复用素材回执体系但须明确 operation。

禁止把画布 assetId 当业务 assetId；禁止让客户端任选他人的 fileId。同一请求重试不重复建库条目，修改名字等异参重试报幂等冲突。已有条目覆盖必须额外明确 expectedVersion，默认新增。

**B. 供应商身份建议：** 若需要 Sora 视频角色身份，单独提供 `/identities/costEstimate`、`/identities/create`、`/identities/detail`、`/identities/list`、`/identities/submission`、`/identities/delete`。输入为授权视频 assetId、modelId、startSeconds/endSeconds；范围上限来自模型能力，不能硬编码所有供应商都是 1–3 秒。结果区分内部 identityId、providerIdentityId、username、状态/失效原因。

生成引用内部 identityId，由后端转换供应商标识。业务角色库与身份可以关联，但不是同一种 ID。create-scene 不得调用角色身份注册接口。

### G5：高级图像/视频能力（P1）

建议按 operation 和 referenceRoles 扩展现有生成框架，而非开放任意供应商 URL：

- imageInpaint：sourceImageAssetId、maskAssetId、prompt；明确遮罩黑白含义、尺寸一致性、透明通道规则。
- imageOutpaint：sourceImageAssetId、目标尺寸、各方向扩展像素、prompt；替代旧 MJ imagine/modal 拼接。
- 视频首尾帧：firstFrame/lastFrame；明确是否允许只有首帧，模型支持比例/时长组合。
- 视频/音频参考：referenceVideo/referenceAudio、时间范围、个数/长度限制。
- 供应商角色身份：identityId 列表及引用位置，不能用 sourceLinkId 替代。
- MJ variation/upscale 等保留时：引用内部原 generationId 与 action 枚举，服务端查原供应商任务，不让客户端任意传任务 ID。
- Wan/HappyHorse 等专用模型：后端适配和计费验证完成后才能在目录 available=true。

全部继续使用授权素材、报价、幂等提交、历史恢复和明确的不可恢复错误。mask/首尾帧不能偷偷降级为普通参考图。

### G6：批次补齐（P1）

v2 已有批次创建/查询/重试。缺少 `GET /batches/list`：建议支持 canvasId、status、page/pageSize，返回 total/items，列表带摘要和创建时间。当前前端只能从本机记录与已加载历史发现 batchId，不能保证跨设备完整。

为既有 `/batches/costEstimate` 明确正式响应示例：总预留积分、余额、是否足额、逐项 clientItemId/outputIndex/单价/数量/小计、报价有效期。当前前端兼容 totalCredits/creditCost/totalEstimatedCredits 并提供手填上限，应联调后收敛为单一正式契约。现有 maxTotalCredits 是预留上限，不自动等于供应商最终费用封顶。

### G7：依赖图执行（P2，可选）

“提取后创建一组节点”和“批次提交一组独立任务”都不等于按依赖执行。若需要自动跑完整流程，新增 runs/validate、costEstimate、create、detail、list、cancel、retryFailed、submission；返回拓扑计划、节点任务、等待依赖/执行状态、输入输出映射。

必须定义循环检测、失效输入、分支并行、失败阻断、预算上限、取消与已完成输出复用。不支持的纯 UI 节点应标为跳过/输出消费，不提交模型任务。本项不阻塞单节点接入。

## 5. 共用后端约束

- 每次按登录用户校验 canvas、revision、node、shot、asset、task、libraryItem 的归属；删除画布禁止新任务，历史保留策略明示。
- 任务读取不可变修订；模型配置/模板/媒体输入冻结快照，后续模型管理变化不修改旧任务输入。
- 幂等键至少按用户与操作命名空间隔离；同键同参返回同结果，同键异参报冲突。网络断开先查回执，不能自动换新标识重购。
- 预留、扣费、释放均有可追踪账目；取消不等于退款，重试结算不等于重新调用模型。
- 媒体优先使用内部 assetId；如允许 URL，后端做来源/协议/内网访问限制与大小/类型校验。不能接收客户端供应商密钥或任意目标地址。
- 错误保持 `{code,message,data}` 项目风格，data 建议含 errorCode、nodeId、shotId、fieldPath、retryable、taskId。建议明确 MODEL_OPERATION_UNSUPPORTED、INPUT_TOO_LARGE、MEDIA_ROLE_UNSUPPORTED、RESULT_SCHEMA_INVALID、IDEMPOTENCY_CONFLICT 等；不强行改现有错误状态码。
- 长任务状态与终态明确；返回 shouldPoll/actions 驱动前端，不让前端猜哪些供应商可取消/恢复。
- capability 版本只在部署及适配完成后提升；新 schema 兼容旧保存文档，不自动重写历史修订。

## 6. 前端待接入清单（不能转成后端重复开发）

| 编号 | 前端事项 | 后端依赖 |
| --- | --- | --- |
| F1 | 四类专用媒体节点的白名单、模型绑定、输入冻结、状态/结果、批次适配 | G1 契约确认；已有基本媒体生成 |
| F2 | 提取、分镜、视频分析、侧栏 Chat 的文本/视觉模型选择器迁移 | type=1 已存在；精准能力依赖 G3 |
| F3 | 描述 textModelId 当前只是节点设置，尚无执行绑定；补对应 task model 校验 | G2/G3 |
| F4 | 移除云端文本/分析/扩图/身份操作的浏览器供应商直连与 Key 提示 | G2/G4/G5，未实现时应明确禁用 |
| F5 | 创建场景/角色区分业务入库与身份注册；刷新资产库 | G4 |
| F6 | 跨设备完整批次列表、报价字段收敛 | G6 |
| F7 | 文本/分析任务历史、恢复、应用与并发编辑保护 | G2 |
| F8 | 模型 supportedNodeTypes/inputPorts/referenceRoles 全链路驱动 UI | 已有字段可先校验；新增能力随 G3/G5 |
| F9 | 统一旧本地 history 与云端任务展示，不能用本地缓存推断云端成功 | 已有 generations/list/detail |

## 7. 跨节点辅助能力与非缺口

- 侧栏 Chat 仍有旧供应商请求链；若云端保留，应复用受控 chat 任务或另行定义流式会话契约（会话ID、消息ID、中断、用量），不可借管理 dry-run 承担正式聊天。
- 提示词模板本地应用/导入不需要模型执行接口；如要求跨设备模板同步，可评估现有 `/api/v1/studio/prompts`，这不是当前生成阻塞项。
- 资产库查询、封面关联已接入；完整资产入库与供应商身份尚未接入，见 G4。
- 浏览器文件导出、ZIP 打包、普通抽帧、缩放、比较、排版无需专用后端接口。超大视频服务端抽帧可另行扩展，不列为现有本地抽帧的必需项。
- 本地缓存助手连接失败不代表云端缺接口；本机助手的文件权限、端口与浏览器下载需独立处理。
- 分享、多人协作不属于现有节点按钮的必要接口，本次不作为全节点可用的前置需求。

## 8. 联调验收清单

1. 普通用户无系统供应商管理权限时仍能获取模型目录；无模型、停用、能力不符均有明确提示。
2. 四类专用媒体节点完成保存、报价、提交、刷新恢复、结果回填；描述连线和选中参考图与冻结输入一致。
3. 文本增强/过滤、小说提取、分镜拆解/汇总分别成功；畸形 JSON、超长文本、空结果可定位到节点。
4. 视频分析分别测试原视频与帧组；口播用实际含音频样本验证，不能仅看截图推测台词；时间戳有序且不超过时长。
5. 所有收费任务断网重发不重复提交/扣费；不足额不创建执行任务；已提交后取消和结算状态符合契约。
6. 执行中修改/删除/重排节点不改变任务输入；应用旧结果需要冲突提示。
7. 角色/场景入库后能从资产库检索、再关联到另一画布；canvasAssetId 与业务 assetId 不串用。
8. 首尾帧/遮罩/身份不支持时拒绝而非静默降级；受保护媒体不能被其他账号访问。
9. 另一设备可分页查看全部批次与任务；费用未知显示未知，非零值默认。
10. 回归 v2 基础图片/视频、镜头生成、上传回执、修订冲突、删除后缓存隔离。

## 9. 代码证据索引

行号会随修改变化，优先按符号定位：

| 文件 | 符号/位置 | 证据 |
| --- | --- | --- |
| src/pages/canvas/TapnowStudio/App.jsx | 添加节点菜单（约26322行） | 主菜单20种节点，另有旧 expand-image 分支 |
| 同上 | startGeneration（约11620行） | 云端提前交给 canvasCloud.generate，忽略旧直连实参构造 |
| src/pages/canvas/TapnowStudio/useCanvasCloud.jsx | generate（约141行）、批次枚举（约243行） | 仅 gen-image/gen-video/storyboard-node |
| src/pages/canvas/TapnowStudio/canvasCloud.js | prepare（约191行） | 普通节点及镜头的模型绑定，未含四类专用节点 |
| src/pages/canvas/TapnowStudio/App.jsx | runDescriptionPromptAction、handleExtractAnalysis | 描述云端禁用；提取仍旧 Chat |
| 同上 | runStoryboardLlmSplit、runStoryboardTablePromptMerge | 分镜文本旧 Chat |
| 同上 | handleGeneratePrompts、handleAutoVideoAnalysis、handleExtractVoiceover | 视频/口播分析旧 Chat |
| 同上 | handleExpandImageZoom、create-character/create-scene 分支 | MJ 与 Sora 身份旧直连 |
| src/pages/canvas/TapnowStudio/components/CanvasTextModelSelect.tsx | StudioModelsApi.getTextModels | 描述节点文本目录已接入，执行尚缺 |
| src/services/studioCanvases.ts | StudioCanvases、CanvasOperation | v2 路径及 operation 仅 imageGenerate/videoGenerate |
| src/services/studioModels.ts | getTextModels/getImageModels/getVideoModels | 普通业务模型目录 |
| src/services/studioAssetLibrary.ts | StudioAssetLibrarySaveRequest | 入库要求业务 assetId/imageVersionId |
| openapi.json、src/services/generated/services/ScriptProcessingService.ts | ScriptDividerRequest、ScriptExtractRequest | 分镜可评估复用；提取存在项目/章节前置条件 |

## 10. 交付要求

后端交付应包含最终 OpenAPI、成功/失败示例、操作与模型能力表、异步状态机、计费/取消/幂等说明、迁移脚本（如需要）、可用测试账号/非付费模拟环境及验收样例。优先确认 G1 节点标准化方案和 G2/G3 文本任务契约，再按工作包实施。本文不要求重做 v2，不把相邻业务接口未经验证地标为已兼容。
