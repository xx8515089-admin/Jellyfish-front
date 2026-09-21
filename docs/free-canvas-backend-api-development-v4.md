# 自由画布 V3 后续接口缺口与后端开发清单

更新：2026-09-16。交接对象：当前 Java 自由画布 V3 后端。

> 阅读范围：本文保留 2026-09-16 的需求背景、建议契约与验收要求。后续已有媒体分析等前端接入，当前实现和待联调边界以 [2026-09-21 接入记录](canvas-handoff-20260921-integration.md)、`contracts/canvas-analysis.openapi.json` 及当前代码为准，不要把下文历史缺口直接当作现状。

> 本文是增量需求与建议契约，不是已上线接口说明。依据是后端提供的 `tapnow-canvas-api-v3.md`、当前前端服务类型和节点执行代码；未访问部署实例的 `/v3/api-docs`，未执行付费调用。工作区相邻 `backend/` 是另一套 Python 工程，不能证明 Java V3 已实现同名功能。后端若已有更新实现，请回传真实 OpenAPI 与示例，优先复用，不重复建接口。
>
> 五种文本操作、四类角色/场景媒体生成、业务库入库和批次列表已有 V3 契约和前端调用链，参见 [V3 接入说明](free-canvas-cloud-integration-v3.md)，不属于本建议稿的重新开发范围。

## 1. 可直接分派的任务

| 顺序 | 工作包 | 必须交付的能力 | 本轮判定 |
| --- | --- | --- | --- |
| P0-1 | 关键帧提示词反推 | 图片帧组输入，结构化场景、中文/英文提示词 | 当前 V3 没有识图执行契约；普通文本 tasks 仅支持 text |
| P0-2 | AI 导演视频拆解 | 真正视频输入，按时间输出镜头、动作、运镜和关键帧引用 | V3 文档明确未开放 `videoAnalyze` |
| P0-3 | 视频/音频口播转写 | 真实音轨输入、带时间戳文本、无音轨/无人声结果 | V3 文档明确未开放 `transcribeAudio` |
| P0-4 | 分析任务公共能力 | 多模态模型目录、报价、幂等提交、查询、恢复、取消、结算 | 复用现有任务基础设施，补面向分析的业务契约 |
| P1 | 高级图像/视频生成 | 遮罩、扩图、首尾帧、视频续写/混剪、供应商动作 | 分项能力开关；具体供应商支持情况由后端确认 |
| P1 | 供应商角色身份 | 从视频片段创建并复用供应商身份 | 与业务角色/场景入库分开；V3 明确未开放 |
| P2 | 云端通用聊天、整图调度 | 对话任务、多模态附件；有依赖的 DAG 执行 | 前端云分支未接入；不能把已有独立批次宣称为工作流执行 |

建议先交付 P0-1/2/3 和共用任务协议，使截图中的“视频拆解 / 提示词反推”可真正执行。不要为了这个节点重新实现图片/视频生成接口。

## 2. 截图问题的准确原因

节点类型：`video-analyze`。

- 预览视频、读取时长已经接入，不等于 AI 分析接口已接入。
- “手动选帧拆解”调用 `handleGeneratePrompts`；云端分支当前直接返回“视频识别提示词尚未开放”。
- “AI 导演拆解”调用 `handleAutoVideoAnalysis`；云端分支当前直接返回“视频分析尚未开放”。
- 口播处理函数 `handleExtractVoiceover` 的云端分支直接返回“音频转写尚未开放”；当前主节点渲染没有独立转写按钮，自动拆解结果区包含口播结果。接口完成后前端还需补入口。
- 截图“已选关键帧 0 个”是另一项独立条件：手动模式需要先在 `video-input` 中抽帧并选择关键帧。AI 视频节点直连只提供已应用视频，不自动替用户抽帧。
- 旧 `gemini-3-pro` 是本地供应商配置回退值，不是服务端已验证的视频模型目录。本轮前端已在云模式隐藏该假象，显示未开放提示并禁用实际 AI 执行按钮。
- 不能复用旧转写代码“只发几张静态图片”来实现音频转写；没有真实音轨输入时，无法可靠取得口播。

## 3. 全节点核查结果

“已有调用链”表示代码已调用 V3，不等于部署环境与供应商端到端联调通过。

| 节点 / 功能 | 当前状态 | 后端增量需求 |
| --- | --- | --- |
| `text-node` 文本编辑 | 本地编辑、保存、连线传递已实现 | 无 |
| `input-image` 图片输入 | 导入、引用、素材绑定、预览已有 | 无独立生成接口需求 |
| `video-input` 视频输入/关键帧整理 | 播放、浏览器抽帧与选帧已有 | 大视频服务端抽帧可选，非 P0 必须 |
| `novel-input` 小说输入/提取 | V3 `extractCharactersScenes` 已接入 | 无重复建设 |
| `extract-characters-scenes` | V3 文本任务已接入 | 无重复建设 |
| `character-description`、`scene-description` | `promptEnhance` / `promptFilter` 已接入 | 带图理解若新增，须另声明多模态能力 |
| `gen-image`、`gen-video` 基础生成 | generations 已接入 | 仅高级输入/动作扩展 |
| `generate-character-image/video`、`generate-scene-image/video` | V3 支持类型、绑定、结果应用已有 | 无重复建设；测试目录能力与实际路由一致 |
| `create-character`、`create-scene` 的业务资产发布 | V3 图片初筛与 `publishLibrary` 已接入 | 无重复建设；不等于供应商身份注册 |
| 上述节点的供应商身份旧功能 | 云端拦截 | P1 供应商身份契约 |
| `video-analyze` 手动反推/导演拆解 | 执行接口缺失 | P0-1、P0-2 |
| 口播/音频转写 | 执行接口缺失 | P0-3，前端补独立入口 |
| `storyboard-node` 编辑、文字拆分/汇总 | 本地编辑 + V3 `storyboardSplit` / `storyboardPromptMerge` | 无重复建设 |
| `storyboard-node` 单镜头/批量图片视频 | V3 generations / batches 已接入 | 分析结果导入是前端映射，不新增生成接口 |
| `image-compare` 图片对比 | 本地功能 | 无 |
| `preview` 预览/复制/发送素材 | 已接入鉴权素材与前端交互 | 无 AI 接口需求；复制的是需登录的应用预览链接 |
| `local-save`（兼容 `save-to-local`） | 本机助手协议与文件写入 | 不是云端 Java 接口缺口；云端下载不能直接写任意本机目录 |
| `expand-image` 等旧入口 | 旧供应商分支，部分入口不在主菜单 | 若保留，纳入 P1 图像编辑，不迁移旧供应商 Key 到浏览器 |
| 侧栏聊天（不是节点） | 云端通用聊天未开放 | P2 对话执行契约 |
| 连线、断线、拖动、结果应用 | 前端图状态与交互逻辑 | 不需要按点击新增服务端接口 |

## 4. P0 建议接口契约（待后端确认）

### 4.1 兼容约束

- 统一前缀 `/api/v1/studio/canvases`，鉴权沿用登录返回的原始 Authorization 值，不自行添加 Bearer。
- 继续 `{code,message,data}` 响应封装、画布归属检查、PROJECT_READ / PROJECT_UPDATE 权限。
- canvasId、revisionNo、assetId、modelId 使用后端真实数值 ID；nodeId 原字符串保留（包含中文、空格）；场景/帧使用稳定 ID，不以数组下标当业务标识。
- 原 `tasks/*` 的五种 P0 文本操作保持兼容，不能将 `inputModalities=["text"]` 当作视频能力。
- 推荐独立 `analysis/*` 业务入口，底层复用现有报价、任务、用量、租约和幂等设施。如果后端选择扩展 `tasks/*`，请提供 operation 判别式与独立结果 schema，不让旧文本客户端误解析视频结果。
- 下文 `framePromptGenerate`、`videoAnalyze`、`transcribeAudio`、`analysisTasksReady` 等是建议命名，前端目前没有发送这些新请求，也不会仅因布尔开关为 true 就放开未实现的执行链。

### 4.2 能力与模型目录

建议：`GET /analysis/capabilities`、`GET /analysis/models?operation=videoAnalyze`。
现有 `/capabilities` 增加 `analysisTasksReady`（默认 false），缺迁移、缺路由时基础画布仍可用。

能力响应至少包含：

```json
{
  "analysisTasksReady": true,
  "operations": ["framePromptGenerate", "videoAnalyze", "transcribeAudio"],
  "limits": {
    "maxFramesPerTask": 60,
    "maxVideoDurationSeconds": 300,
    "maxMediaSizeBytes": 104857600,
    "maxScenes": 100,
    "maxConcurrentTasksPerUser": 2
  }
}
```

数值为接口形状示例，实际限制由部署与供应商决定，不能据此硬编码。

模型条目必须给出：`modelId`、`name`、`supplierName`、`available`、`unavailableReason`、`supportedOperations`、`inputModalities`、各操作限制、`supportsAudioTrack`。只返回当前用户可用模型，不返回供应商 Key、URL、模板。禁止前端按名称含 Gemini 就推测支持视频。

前端拟新增分析节点模型绑定 `/settings/analysisModelId`；后端保存校验需识别此字段及分析目录。现有 `/settings/model` 是旧分析节点字段，若后端选择沿用，须明确该节点使用分析目录校验，不能拿媒体生成目录校验它。接口联调前双方定稿一种路径。

### 4.3 任务生命周期接口

| 方法 | 建议路径 | 最小职责 |
| --- | --- | --- |
| POST | `/analysis/costEstimate` | 验证冻结修订、连线、素材和模型，生成有效期报价与 inputHash |
| POST | `/analysis/create` | 只接受 quoteId、幂等标识和预留上限，创建持久任务 |
| GET | `/analysis/detail` | canvasId + taskId，返回状态、结果、用量、可执行动作 |
| GET | `/analysis/submission` | canvasId + clientRequestId，恢复超时提交回执 |
| GET | `/analysis/list` | canvasId 必填；nodeId/operation/status 可选；page/pageSize；先筛选后分页 |
| POST | `/analysis/cancel` | 调用前取消或提交取消请求；明确已经调用时的结果/费用行为 |
| POST | `/analysis/retry` | 仅对服务端允许重试的任务，按新有效报价重试 |
| POST | `/analysis/retrySettlement` | 只用持久化用量重算费用，不再次调用模型 |
| POST | `/analysis/syncResult` | 可选；仅有供应商任务查询能力时恢复结果，并由 actions 声明 |

前端流程：上传/关联素材 → 保存画布修订 → 报价 → 展示预留与余额并确认 → 持久保存 clientRequestId → 提交 → 按 shouldPoll 查询 → 用户应用结果 → 保存新修订。
网络超时保持原 clientRequestId 和原参数，通过 submission 找回；不能以 retry 代替找回原提交。

### 4.4 输入冻结与素材选择

报价建议请求（手动关键帧）：

```json
{
  "canvasId": 12,
  "revisionNo": 8,
  "nodeId": "视频拆解 01",
  "operation": "framePromptGenerate",
  "modelId": 25,
  "sourceNodeId": "视频输入 01",
  "selection": {
    "frames": [
      {"frameId":"frame-a","assetId":311,"timeSeconds":0.5},
      {"frameId":"frame-b","assetId":312,"timeSeconds":2.5}
    ]
  },
  "parameters": {"segmentDurationSeconds":3,"promptLanguages":["zh-CN","en"]}
}
```

服务端不能直接信任 selection：必须与该 revision 的实际连线、selectedKeyframes、assetBindings 比对，并按归属加载对应二进制；报价保存完全规范化后的输入，create 不重新从当前画布取素材。

- 帧图片仍经已有 `/assets/upload` 上传并保存 source 节点 `/selectedKeyframes/{index}/url` 的 assetBindings；`frameId` 是拟补的稳定帧字段，不是假设现有全部帧已有 ID。
- 原视频通过 source 节点 `/content` 的 assetBindings 获取；AI 视频、视频输入、视频预览可作为来源，但只能读取显式已应用且已绑定的结果，不猜“最新历史任务”。
- 需要兼容图片输入：允许一张图片作为时间 0 的单帧反推；此时不伪造原视频时长或音轨。
- 手动模式仅分析选择的帧。按时间 0 起分组，每组长度 segmentDurationSeconds，帧按时间排序；不静默截断到前 15 帧。不满足模型上限时明确报错或报价前返回服务端分批计划。
- 视频分析的 selection 改为 `{"videoAssetId":310}`；可增加合法 startSeconds/endSeconds 裁剪范围。需要对真实时长校验，而非信任前端 videoMeta。
- 转写的 selection 是 videoAssetId 或 audioAssetId（二选一）。后端从视频提取真实音轨或直接读取音频，并校验模型模态。
- assetId 必须属于该画布或已经通过 attach 关联；禁止供应商读取任意客户端 URL、blob:、file: 或前端提交的 base64 大包。
- sourceNodeId 用于定位冻结连线，不能绕过连线输入权限；inputHash 覆盖 operation、模型路由、素材版本、帧 ID/时间、语言及分组/裁剪参数。

报价响应复用现有语义：quoteId、inputHash、expiresAt、reservedCredits、actualCredits:null、currentBalance、sufficient、unlimited。数值 0 不等于未知，未知使用 null；预算只约束预留，不伪称已锁最终费用。

提交：

```json
{"canvasId":12,"quoteId":"aq-example","clientRequestId":"analysis-unique-id","maxReservedCredits":10}
```

### 4.5 结构化结果

所有任务公共字段：taskId、canvasId、revisionNo、nodeId、sourceNodeId、operation、modelId、inputHash、status、progress、shouldPoll、cancelRequested、actions、error、billingState、reservedCredits、actualCredits、usage、createdAt、updatedAt、result。
状态码应与后端任务体系统一并在 OpenAPI 给出枚举；前端以 shouldPoll/actions 决定轮询与按钮，不能仅凭 status 数值猜能否重试。失败/待核查也必须保留真实用量和请求证据。

关键帧反推结果示例：

```json
{
  "schemaVersion":1,
  "operation":"framePromptGenerate",
  "scenes":[{
    "sceneId":"scene-a",
    "startSeconds":0,
    "endSeconds":3,
    "description":"雨夜巷道中，人物撑伞缓慢前行",
    "cameraMovement":"平稳跟随",
    "subjectDynamics":"向前走两步",
    "atmosphere":"冷色雨夜",
    "prompts":{"zh":"中远景，平稳跟随撑伞人物沿雨巷前行","en":"Medium-wide shot, steady tracking of a person walking through a rainy alley"},
    "keyframes":[{"frameId":"frame-a","assetId":311,"timeSeconds":0.5,"role":"current","description":"人物撑伞背影"}],
    "tags":{"style":["电影写实"],"camera":["跟随"],"color":["青蓝"]}
  }],
  "warnings":[]
}
```

`videoAnalyze` 使用相同 scenes schema，增加 `sourceVideoAssetId`、`durationSeconds`、`hasAudio`；可选 `transcript`。只有实际执行音轨识别时才允许返回 transcript，需在模型目录与报价中声明费用。服务端产生的新关键帧应先入画布素材库再返回 assetId，不返回裸供应商 URL。

`transcribeAudio` 结果示例：

```json
{
  "schemaVersion":1,
  "operation":"transcribeAudio",
  "sourceAssetId":310,
  "durationSeconds":5,
  "hasAudio":true,
  "language":"zh-CN",
  "segments":[{"segmentId":"speech-a","startSeconds":0.8,"endSeconds":2.4,"text":"我们回家吧","speaker":null}],
  "fullText":"我们回家吧",
  "warnings":[]
}
```

无音轨返回 `hasAudio:false, segments:[], fullText:""` 及明确 warning；有音轨但无人声返回 hasAudio:true、空 segments。禁止根据图像猜测台词。是否检测到无音轨就免供应商调用/免费用，要在报价与结算协议里明确。

通用约束：时间为有限数值、单位秒，0 ≤ start < end ≤ 实际输入时长；单帧任务可以定义零长度场景但必须在 schema 明示。sceneId/frameId/segmentId 稳定且在任务内唯一。description 与提示词为文字，不返回 Markdown 包裹的 JSON；不能把结构化解析失败标为业务成功。帧内无法观察的运镜推测应明确为推断，不伪造未提交的相邻帧。

### 4.6 应用到前端的字段映射

前端统一新结果写入 `settings.analysisResults`、`settings.voiceoverResults`，停止部分操作写根字段、部分写 settings 的分裂行为；读取旧根字段可保留兼容。

| 后端字段 | 前端旧 UI 适配目标 |
| --- | --- |
| scenes[].sceneId | 作为导入分镜的稳定来源 ID，不拿数组序号关联任务 |
| startSeconds/endSeconds | 展示 time_range；排序/裁剪仍保留数值 |
| description、prompts | analysisResults[].keyframes 的 current 项：description、jimeng_prompt、mj_prompt |
| cameraMovement/atmosphere/tags | global_tags 与分镜 camera、tags |
| keyframes[].assetId | 经鉴权 content 加载；选择后可复用已有素材绑定 |
| transcript/segments | voiceoverResults，并保留精确起止时间；不能强制每秒复制一句 |

后端只保存任务结果，不直接修改画布 JSON、连线或创建分镜节点。前端应用前比较 sourceNodeId、当前连接、revisionNo/inputHash；断线、换源、用户编辑后旧结果不能自动回填。用户可以明确选择使用历史结果，但应重新确认目标。创建分镜是用户应用动作，支持撤销，不能在任务轮询每次返回成功时重复创建。

### 4.7 错误、恢复与性能

建议稳定 errorCode：MODEL_OPERATION_UNSUPPORTED、INPUT_MODALITY_UNSUPPORTED、SOURCE_CONNECTION_CHANGED、ASSET_BINDING_MISSING、ASSET_NOT_OWNED、FRAME_SELECTION_EMPTY、MEDIA_TOO_LARGE、VIDEO_TOO_LONG、INVALID_TIME_RANGE、QUOTE_EXPIRED、REVISION_CONFLICT、IDEMPOTENCY_CONFLICT、INSUFFICIENT_CREDITS、RESULT_SCHEMA_INVALID、PROVIDER_RESULT_UNKNOWN。

继续按现有 V3 的 HTTP 422 校验错误、业务响应 errorCode 约定；如调整 HTTP 映射请提供完整列表，不静默改成前端未处理的结构。

- 请求超时/供应商调用结果未知时进入待核查，不自动重复调用或假定费用释放。
- worker 领取任务有租约和心跳，进程重启不丢任务；取消与完成竞争需有确定的最终状态。
- 保存冻结输入/供应商请求 ID/真实 usage，结算失败可重试结算，不再次生成内容。
- 限制用户并发、单任务素材大小、帧数、视频时长、输出镜头数和轮询频率；建议返回 retryAfterMs。
- 列表分页只返回摘要；详情返回结构化结果，二进制走 content；避免每次轮询下发整段视频或所有帧 base64。
- 同一素材/时间点抽帧可在授权范围内缓存；幂等是执行约束，不能只依赖缓存。

## 5. P1 / P2 其他缺口：单独排期

以下为需要后端定稿的功能契约，不是现有可调用路径。

| 能力 | 建议 operation / 输入 | 结果与关键约束 |
| --- | --- | --- |
| 遮罩重绘 | imageInpaint：基础 imageAssetId、maskAssetId、提示词、模型、参数 | 画布图片 assetId；校验遮罩尺寸、透明/黑白含义、引用角色 |
| 扩图 | imageOutpaint：基础图片、目标比例或四边扩展量 | 画布图片 assetId；不能直接复用供应商按钮索引而无任务绑定 |
| 首尾帧视频 | 扩展 videoGenerate 的 firstFrame/lastFrame 角色和输入端口 | 模型目录必须声明；缺任一必填帧时拒绝，不降级普通图生视频 |
| 视频续写/混剪 | videoExtend/videoRemix：源视频素材或供应商原任务 ID、扩展时长/提示词 | 视频 assetId；供应商任务归属、允许的原模型、费用、恢复能力 |
| MJ 等供应商变体/放大 | imageVariation/imageUpscale：原 generationId、outputIndex、服务端允许的 actionId | 新任务和素材；不信任客户端任意 customId/供应商 URL |
| 供应商角色身份 | providerIdentityCreate：视频 assetId、起止时间、模型/供应商能力 | identityId、provider、status、可复用模型范围；不是 libraryItemId。是否复用旧 1–3 秒范围由供应商能力返回，不硬编码 |
| 通用聊天 | chat：会话 ID、文字、合法附件 assetId、模型 | 持久化消息、任务/流式协议、报价用量、幂等恢复；不由普通文本五操作承接 |
| 整图调度 | workflowRun：canvasId/revisionNo、目标或子图、预算 | 校验 DAG、拓扑执行、输入依赖、跳过/失败策略、逐节点状态、取消和恢复。现有 batches 只执行独立任务，不是 DAG |

若某项不在产品范围，后端可明确标为“不建设/暂不支持”，前端据此隐藏对应入口。不要把所有旧供应商动作一次性做成无约束透传接口。

## 6. 后端验收清单

1. 5 秒雨夜视频可通过 AI 视频 → 视频解析执行 videoAnalyze，返回带起止时间的镜头和两种语言提示词。
2. 视频输入选择 2 帧，framePromptGenerate 只处理这 2 帧；0 帧拒绝，超上限明确拒绝/显式分批。
3. 同视频分别用有声、无声、纯音乐样本验证转写；无音轨/无人声不编造文本。
4. 文本模型不能作为视频/音频模型执行；没有可用模型时目录返回原因，前端无默认 Gemini 猜测。
5. 换源、断线、删除节点后在途任务仍可查看历史，但不自动覆盖当前节点；旧修订结果可经确认手动应用。
6. 用户甲不能报价、读取或执行用户乙素材；所有内容读取仍走同一归属校验。
7. 报价过期、余额不足、输入与报价不匹配、同幂等标识不同参数有明确 errorCode。
8. create 超时后 submission 返回同一任务；服务重启、worker 租约过期不造成重复计费调用。
9. 调用前取消释放预留；调用后取消/结果未知保留真实费用证据；retrySettlement 不调用供应商。
10. 结构化结果超时、损坏、缺字段、非法时间、超量镜头都不以空“成功”掩盖。
11. 结果应用/导入分镜支持稳定场景 ID；多次刷新查询不会重复创建分镜。
12. 大视频/多帧提交有明确上限；任务列表不返回 base64；分页、并发和轮询限流可验证。

## 7. 后端交付与前端后续工作

后端请提供：

- 最终 OpenAPI（能力、模型、报价、任务全生命周期、结构化结果与错误枚举）。
- 数据库迁移及回滚/部署顺序、缺表时能力开关行为。
- 每种 operation 一份真实成功响应，以及无音轨、超限、报价过期、余额不足、任务未知的响应。
- 已验证的模型/供应商/输入模态清单；支持音轨、首尾帧、身份等不能仅由模型名推断。
- 测试环境地址、普通用户测试权限和无付费或明确预算的联调方案；无需向前端提供供应商密钥。

前端收到定稿后负责：模型选择器、analysisModelId 绑定、选帧上传和冻结、报价确认/幂等回执/任务历史、结构化结果映射、口播入口、断线竞态与撤销恢复回归。当前提交仅修正未开放能力提示，没有伪造后端接口或启用旧供应商直连。

## 8. 证据定位（相对前端仓库）

- `src/pages/canvas/TapnowStudio/actions/mediaActions.js`：handleGeneratePrompts、handleAutoVideoAnalysis、handleExtractVoiceover、createCharacter、handleExpandImageZoom。
- `src/pages/canvas/TapnowStudio/actions/chatActions.js`：sendChatMessage 云端拦截。
- `src/pages/canvas/TapnowStudio/views/renderCanvasNode.jsx`：video-analyze 的输入、模式、模型与按钮；当前无独立转写按钮。
- `src/pages/canvas/TapnowStudio/actions/storyboardActions.js`：importShotsFromAnalysis / createStoryboardFromAnalysisResult 的旧结果映射。
- `src/pages/canvas/TapnowStudio/useCanvasCloud.jsx`：现有文字/生成/库发布调用，以及遮罩能力限制。
- `src/services/studioCanvasV3Types.ts`、`src/services/studioCanvases.ts`：当前正式五操作枚举、能力和请求类型。
- 后端提供的 `tapnow-canvas-api-v3.md` 第 4 节（仅 text）、第 8 节（明确未开放能力）。
