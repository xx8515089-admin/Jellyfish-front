# 工作流前端修复清单

审查日期：2026-09-20。对象：当前工作区代码（包含尚未提交的改动），不是某个已发布版本。

结论：发现 **7 类前端问题**。7 类均有可执行的生产函数/闭包复现；FE-06 中配音有执行复现，该类其余入口依据请求、错误处理和卸载路径确认。优先解决草稿隔离、任务恢复竞态和提交身份丢失，再处理就绪状态与导出版本问题。

配套文档：[工作流后端修复与契约核实清单](workflow-backend-fixes-2026-09-20.md)。本次只新增审查文档和复现脚本，未修改业务代码。

## 审查边界与验证

- 检查剧本/分集编辑与新增、资产提取和图片生成、分镜编辑、普通图片/视频生成、批量视频、独立图生视频、配音、任务恢复和素材导出。
- 本地执行相关既有测试：**173/173 通过**。覆盖 asset、episode-assets、workflow-media、storyboard、image-to-video 系列；通过不代表覆盖了以下边界。
- 新增 [审计复现脚本](../../scripts/audit-workflow-known-issues.mjs)：**8/8 复现断言通过**。它断言的是当前错误行为，不能作为“修复通过”的回归标准；修复时应改为正确行为断言并纳入对应正式测试。
- 脚本转译并执行实际 TypeScript 函数或 AST 提取的生产闭包，以模拟存储、延迟响应和网络异常；不是完整浏览器端到端测试。
- 未启动服务、未发起真实生成或扣费、未联调线上接口。错误响应组合是否由线上后端实际产生，见后端文档的核实项。
- 前一轮批量视频的“提示词双份状态不同步”和“恢复受理后未重置提交身份”已有代码修复，不重复列入待办。
- `docs/workflow-backend-handoff.md` 是历史交接，不可把其中旧事项直接当成本次未修复问题。

复现命令（仓库根目录）：

```powershell
node --test scripts/audit-workflow-known-issues.mjs
```

## 修复优先级与分工

P1：可能丢失编辑、跨账号读取本地草稿、丢失提交恢复身份或允许不确定任务再次提交。P2：特定状态/结构变化下结果展示或导出版本错误。

| 编号 | 优先级 | 问题 | 修复归属 |
| --- | --- | --- | --- |
| FE-01 | P1 | 恢复的未保存提示词被服务端旧值覆盖 | 前端可独立修复 |
| FE-02 | P1 | 创建草稿未按账号隔离；片段草稿使用全局单槽位 | 前端可独立修复 |
| FE-03 | P1 | 迟到的提交查询清掉后续新任务的恢复记录 | 前端可独立修复 |
| FE-04 | P1 | 通用 502 被当作明确拒绝，丢弃原请求标识 | 前端先保守修复；后端 BE-02 明确错误语义 |
| FE-05 | P2 | 普通媒体轮询忽略就绪/停止轮询字段 | 前端修复；后端 BE-03 核实合法状态组合 |
| FE-06 | P1 | 配音等入口未完整保存“提交结果未知”状态 | 前端先保留状态；完整恢复依赖 BE-01 |
| FE-07 | P2 | 插入/删除片段后，导出使用旧序号筛掉已选版本 | 前端可独立修复 |

## FE-01：刷新后未保存的视频提示词被覆盖

**证据**

- `src/pages/aiStudio/project/ProjectClipEditingStep.tsx:1156` 读取草稿，`:1184` 用草稿初始化 `promptByClip`。
- 同文件 `:1338` 的 `manuallyEditedPromptClipIdsRef` 每次挂载均为空集合；`:1359` 持久化数据未包含该脏标记或对应服务端基线。
- 同文件 `:2389` 的详情回填和 `:2474` 的 effect 只保护当前会话标记过的提示词，恢复出的本地编辑不受保护。

**触发与结果**

1. 编辑已有片段的视频提示词，等待本地草稿落盘，不提交服务端保存。
2. 刷新/重新挂载片段编辑页，源签名仍相同，首先恢复出本地新文本。
3. 详情 GET 返回旧 `directorPrompt.prompt`，空的脏标记集合允许覆盖，界面和后续草稿变回旧文本。

`REPRO FE-01` 执行实际 ref 初始化和详情更新闭包，确认 `UNSAVED LOCAL PROMPT` 被替换为 `OLD SERVER PROMPT`。

**修复方案**

- 将“本地编辑值、是否修改、编辑时的服务端版本/基线”一并持久化，恢复时一起恢复。
- 详情请求只回填无本地修改的字段；本地基线过期时明确提示冲突，不能静默覆盖。
- 片段结构/标题变化时按稳定 segmentId 合并草稿，不因整集 `sourceSignature` 改变就清空其他片段的编辑。
- 批量提交使用真正的本地覆盖值；避免将普通详情缓存值一律当作用户新编辑。`storyboardVideoBatchPolicy.ts` 当前会提交 `promptDrafts` 中所有存在的选中项。

**验收**：编辑后刷新仍保留文本；保存成功后才清除脏标记；详情晚到不能覆盖；服务端版本更新能提示冲突；编辑一个片段的结构不丢失其他片段未保存文本。

## FE-02：本地创建草稿缺少账号和片段作用域隔离

**证据**

- `src/pages/aiStudio/project/projectCreationDraft.ts:39` 使用固定 project/assets/clips key；`:97` 的扩展 key 仅增加 importId，不含账号。
- `src/auth.ts:143` 退出只删除认证 token、user、menus。`src/layouts/MainLayout.tsx:250` 的退出流程没有清理/切换草稿命名空间。
- `ProjectCreatePage.tsx:717` 读取全局 project 草稿；直接进入创建页且非恢复远端项目时使用该草稿初始化剧本文本等信息。
- `ProjectClipEditingStep.tsx:1156`、`:1359` 始终读写全局 clips key。资产页 `ProjectAssetsStep.tsx:829` 已按 importId 扩展，但仍不含账号。

**触发与结果**

- 同一浏览器 A 留下草稿后退出，B 登录后直接访问 `/projects/create`，读取函数仍可返回 A 的草稿。复现脚本确认切换到 B 后读取到 A 的剧本文本。
- 大厅“新建”按钮会主动清草稿（`ProjectLobby.tsx:267`），所以该特定入口可能遮住问题；直接路由、刷新和认证切换不具备同样保护。
- clips 是单槽位：不同集/项目的草稿互相覆盖。源签名能阻止部分误恢复，但不能保留被覆盖的另一个作用域草稿；内容变更也会触发整份草稿失效。

**修复方案**

- localStorage 和 IndexedDB 统一使用账号 + importId + episodeId（必要时 runId）命名空间，创建中的未提交项目使用稳定 draftId。
- 草稿 envelope 包含 owner/scope，读取时验证；登录切换同时隔离内存状态和异步写入队列。
- 不自动把无法证明归属的历史全局草稿迁移给当前账号；迁移与清理策略应保留可归属的数据。
- 切集前保存当前集，切集后读取目标集，不依赖首次 `useState` 初始化完成所有恢复。

**验收**：A/B 切换互不显示/覆写草稿；同账号两个项目与两集互不覆盖；退出后迟到的 IndexedDB 写入不能写进下一账号；刷新与正常新建都符合相同隔离规则。

## FE-03：普通媒体提交恢复存在并发竞态

**证据**

- `src/pages/aiStudio/project/useWorkflowMedia.ts:181` 的 `recover` 不占用 `submissionLock`，成功后无条件清 `pendingRef`、React pending 与 sessionStorage。
- `ProjectClipEditingStep.tsx:4015` 的“查询提交”允许连续点击，也没有与“重试原请求”共用恢复锁。
- 新批量视频 hook 已有恢复锁；此处问题位于普通单片段媒体 hook。

**精确复现顺序**

1. 请求 A 超时，保留 pending A。
2. 发起两个 A 的查询 Q1、Q2，Q1 较慢。
3. Q2 先确认 A 已受理并清掉 pending，用户现在可以提交 B。
4. B 超时，保存 pending B。
5. Q1 晚到，无条件清 pending 和存储，导致 B 的原请求及恢复标识丢失。

`REPRO FE-03` 用 deferred promises 执行真实 hook，确认 B 的请求标识先存在、随后被 Q1 清除。

**修复方案**

- 新提交、原样重发、恢复查询使用同一同步锁；界面展示恢复中状态。
- 每次异步操作捕获 requestId/作用域/生命周期版本；写回前比较当前 pending 是否仍为同一提交。
- 即使引入锁，也保留上述身份比较，防止卸载重挂、账号切换、未来并发改动带来的晚到响应。
- 清存储时只能清除匹配提交，不允许旧操作删除新记录。

**验收**：覆盖双查询逆序返回、查询与重试同时触发、A 查询期间 B 状态变化、退出/切作用域等情况；任何 A 的响应均不能清 B。

## FE-04：通用 502 错误会清掉幂等身份

**证据**

- `src/pages/aiStudio/project/workflowMediaPolicy.ts:29` 的 `isDefiniteSubmissionRejection` 把 HTTP 502 + `body.code=502` 且不是 `IDEMPOTENCY_CONFLICT` 的响应视为明确拒绝。
- `useWorkflowMedia.ts:151` 附近的提交 catch 据此清除保存的完整请求。

**触发与结果**

响应为 `{status:502, body:{code:502, message:'upstream timeout'}}`，没有明确“未受理”信息。当前分类器返回 true，pending 和存储被清空。下次点击会生成新请求标识。

已通过 `REPRO FE-04` 复现。这里确认的是错误分类与身份丢失；后端是否在这种响应前已经创建任务、线上是否出现这种 envelope、是否会产生重复费用，尚未实测。

**修复方案**

- 未知网络/5xx/格式异常默认归为“结果未知”，保留冻结请求及 UUID。
- 只有接口明确承诺的未受理业务错误白名单才能释放；不能用“不是某一个冲突码”作为释放依据。
- 与 BE-02 约定 `errorCode` 和受理状态，保持原始结构化错误，避免服务包装层只剩 message。
- 保留查询及原样重试操作；不要把未知直接渲染成“生成失败，可重新生成”。

**验收**：timeout、通用 500/502/503、缺失 data、未知 errorCode 均保留身份；确定未受理错误才释放；冲突保留原请求供核查。

## FE-05：普通媒体轮询未按契约处理就绪与终态

**证据**

- `src/pages/aiStudio/project/useWorkflowMedia.ts:79` 仅按 status 和 fileId/url 判定继续轮询；固定 3 秒，不消费 `shouldPoll`、`terminal`、`outputReady`、`pollAfterSeconds`。
- 同文件恢复 activeTasks 时只对 status 1/2 启动详情轮询。
- `src/services/generated/models/WorkflowMedia.ts:18` 起以及 `docs/contracts/workflow.openapi.json:630` 已声明上述字段。
- `ProjectClipEditingStep.tsx:1474` 历史展示会过滤 `outputReady === false`，与 hook 的完成判断不一致。

**两种已复现的客户端行为**

1. status=3、fileId/url 都有值、outputReady=false、shouldPoll=true：hook 停止轮询并发出 completedMedia，移除活动任务；历史列表却隐藏该结果。
2. status=2、terminal=true、shouldPoll=false：hook 仍然安排下一次轮询。

以上是契约字段组合的注入测试，不表示已观察到真实后端返回所有组合。BE-03 需明确状态矩阵；即使第二种应为非法响应，前端也不应默默无限轮询。

**修复方案**

- 提取共享 readiness/polling 策略供轮询、历史展示、activeTasks 恢复使用。
- 明确 `outputReady=false` 不能作为可用结果完成；终态待核查应可展示，不能伪装为成功或消失。
- 按双方约定消费 `shouldPoll` 和 `pollAfterSeconds`；缺字段时再使用兼容旧接口的回退规则。
- activeTasks 中已生成但还未可用、仍要求轮询的结果也要恢复跟踪。

**验收**：覆盖产物搬运中、完成可用、失败、人工核查、缺字段旧响应、非法组合、刷新恢复；展示与停止轮询使用一致判断。

## FE-06：其他变更/生成入口对“提交结果未知”处理不完整

已确认客户端保护缺口；是否已被服务端幂等/去重兜底需 BE-01 核实，不能据此宣称已发生重复扣费。

| 入口 | 代码证据 | 当前行为 |
| --- | --- | --- |
| 配音 | `StoryboardDubbingPanel.tsx:132`、`:565`；`src/services/studioDubbing.ts:51` | generate 超时只 toast，finally 解锁；没有 generationId 就不进入该任务轮询。再次点击会再 POST，body 无 clientRequestId。闭包复现连续产生两次请求。 |
| 独立图生视频 | `ImageToVideoModal.tsx:54`、`:184`、`:202`；`ProjectClipEditingStep.tsx:4451` | 有 uncertain 防重，但仅组件内存。busy=false 后允许关闭，父组件卸载；重新打开 uncertain=false。请求模型 `ImageToVideoGenerate.ts` 无提交身份。 |
| 单资产图片生成 | `ProjectAssetsStep.tsx:3341`、`:3360`、`:2956`；`src/services/studioAssetGeneration.ts:2815` | 只有获得 taskId 后才持久化；普通提交异常走 failAssetImageRun，删除 run 并标失败。丢响应时没有可恢复的请求身份。状态刷新可能发现活动任务，但不能证明它对应哪次原始请求。 |
| 新增分集 | `ProjectCreatePage.tsx:2526` | pendingChapterCreation 在 create 返回后才记录。已受理但 create 响应丢失时无法识别原操作。已有“create 成功、后续 list 失败只重查列表”的保护应保留。 |
| 提取资产 | `ProjectCreatePage.tsx:2622` | assetExtractionStartedRef 仅在 POST 成功返回后置 true；异常提示重试，未知结果没有稳定请求身份。是否按 import/revision 去重需后端确认。 |

上述组件路径均位于 `src/pages/aiStudio/project/`。

**前端先做**

- 明确区分校验失败、确认未受理、已受理、受理未知、最终失败；超时不等于最终失败。
- 发请求前保存按账号/业务对象隔离的待确认记录及完整输入；关闭、刷新、切集后仍保留，不通过关闭弹窗消除未知状态。
- 对无可靠请求查询契约的入口先提供查询已有任务/人工核查入口，不能自动再次创建；也不能假定查询暂时无结果就等于没受理。
- 不要直接给独立图生视频/配音套用普通 images/videos 的 submission 路由；它们是独立接口，需后端明确支持。
- 配音生成前的台词保存、设置保存、generate 是三个请求；并发输入一致性另见 BE-04。

**后端补齐后做**：冻结 UUID 和参数，按原 UUID 查询/重放，确认受理后绑定返回任务，保留正常的用户主动“再生成”能力。

**验收**：每个入口模拟“服务端已受理但响应丢失”，关闭重开/刷新不会自动解除未知态；重复点击、同请求重放仅对应原任务；明确失败才允许新的生成身份。

## FE-07：结构变更后导出范围使用过期序号

**证据**

- `ProjectCreatePage.tsx:3560` 在选历史版本时把当时的 episodeIndex/segmentIndex 存入 sessionStorage。
- `src/services/storyboardExport.ts:16` 的 `selectionsInRange` 用缓存序号筛范围。
- `StoryboardExportModal.tsx:22` 打开时只读取缓存；父组件仅传最大序号和 episodeId，没有传当前 segmentId → 序号映射。
- 当前选择更新入口未在结构变化后重新映射这些序号。

**触发与结果**

选择片段 X（原第 2 段）的历史视频 #99；在它前面插入片段后 X 变为第 3 段。按当前界面导出第 3～3 段时，旧 segmentIndex=2 导致 #99 从 mediaSelections 中被筛掉。请求失去用户明确选择，后端只能按未选择时的默认规则处理。

`REPRO FE-07` 已执行实际 `buildExportRequest` 确认该选择缺失。未实际下载 ZIP；最终默认产物以服务端实现为准。

**修复方案**

- 以 segmentId/episodeId 保存选择身份，导出前用当前权威结构解析序号。
- 结构插入、删除、合并及重新解析后协调缓存；已删除片段的选择清理并提示，仍存在片段保留其 generationId。
- 如果全项目的当前映射未加载完整，先查询结构再构建范围，不用旧序号猜测。预检应核对选择版本是否被保留。

**验收**：选旧版本后插入/删除前方片段、跨集重排、删除/合并选中片段；全量和自定义范围都使用当前结构，仍存在的目标保持选择版本。

## 建议实施顺序

1. FE-02 账号隔离，FE-01 草稿保护，FE-03 恢复身份比较：前端可立即完成，不等后端。
2. FE-04 未知错误保留身份；FE-06 先补持久化未知状态。与后端同时落实 BE-01、BE-02。
3. FE-05 统一状态策略、FE-07 导出映射；使用后端给出的状态样例完成联合验证。
4. 把 8 个审计复现断言改为正确行为回归；为 FE-06 其余入口补受理后丢响应、刷新恢复测试，再做受控联调。
