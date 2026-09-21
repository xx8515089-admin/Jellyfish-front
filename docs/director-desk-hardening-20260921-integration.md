# 导演台 2026-09-21 加固接入记录

依据 `director-desk-backend-hardening-20260921.md`，结合配套 `director-desk-api.md` 和现有导演台云工程实现。文档引用的 `director-desk-openapi-20260921.json` 未在下载目录发现；本次按文档明确契约扩展现有客户端，未重新生成 22 路由客户端。

## 接入内容

- API 保留 errorCode、fieldPath、currentRevisionNo、HTTP status 和业务 code，兼容 data=null、网关和未知错误。冲突提示展示字段和当前版本，不依赖中文错误字符串判断 API 类型。
- 素材返回类型与工程 manifest 增加可选 packageId，素材类型增加 dependenciesVerified、dependencyParserVersion。依赖是否可用仍以 validate 结果为准，不把空依赖数组或 verified 当作完整可用证明。
- 每个新导入主模型/动作与本次依赖选择构成素材包；packageId 基于完整路径及 SHA-256 确定，同包同文件重试复用标识，字节变化得到新包。单文件限制 100 MiB；重复内容哈希缓存避免重复读取大文件。
- 选择完整文件夹时去掉浏览器目录选择附加的最外层目录，保留包内路径。包内同路径不同内容拒绝；不同模型包可有同名文件。已上传包不可直接追加或替换；更新时重新导入模型与依赖。
- 恢复先 validate，再以服务端素材列表核对包信息、路径和 ID，下载后验证大小及 SHA-256，最后按包分别注册加载器。旧包 packageId=null 保留独立旧命名空间，不和真实名为 legacy 的新包混淆。URL 路径编码支持空格等字符。
- 复制素材保留包边界并重映射 assetFileId；失效人物绑定继续保留 jellyfishDetachedBindings，使用既有重新绑定提示。
- publishDraft 传递 clientRequestId；新增 publication 只读查询。原发布 ID、工程 ID、草稿版本和正式版本按账户持久化，跨标签页互斥。超时、PUBLICATION_NOT_FOUND、存储错误保留原参数，不认定在途发布失败。
- 有待确认请求时才显示“查询上次发布 / 原样重试发布”，暂停自动保存和新的正式发布。查询不写入发布；原样重试不换版本。成功回执归档，历史查询只提示发布结果，不替换当前场景、不删除后来保存的新草稿。
- 发布期间出现新编辑、新草稿、新正式修订或 deleted 状态时停止后续截图上传，保留当前编辑并提示核对。素材上传期间也检查场景变化，避免旧快照覆盖新编辑。
- 草稿仍沿用独立 CAS，并允许暂存失效的业务绑定；正式发布、截图应用和图片/视频生成沿用原有接口，不创建额外生成链路。

## 本地验证

- `node --test scripts/test-director-cloud.mjs scripts/test-director-performance.mjs scripts/test-director-hardening.mjs`：41 项测试。
- 覆盖发布丢响应及刷新恢复、NOT_FOUND 不自动重发、同参数重试、历史/删除回执及新草稿保留、账户隔离、首次明确校验失败与恢复冲突的区别。
- 覆盖上传响应丢失后的包路径复用、内容变化形成新包、同名文件包隔离、哈希校验、服务端包元数据不匹配、依赖校验失败、复制 ID 映射及实际加载器的跨包阻断。
- 保留原有导演台截图与修订一致性、应用版本以及性能回归。
- `pnpm build` 包含 TypeScript 和 Vite 生产构建；测试与构建日志在 `artifacts/director-hardening-*.log`。

## 待部署后联调

本次未启动服务，未执行 SQL、真实收费请求、MySQL/R2 操作或部署。后端文档所述 096/097/098 迁移由后端部署流程处理。本地模拟测试不代表真实存储或浏览器渲染验收。

需要在已部署的新后端验证：发布并发及凭据事务、两标签页刷新恢复、带外部贴图及内嵌媒体的 ASCII/二进制 FBX、纯动作 FBX、旧 FBX 重验、跨片段副本绑定、R2 写入失败补偿、真实 MySQL 迁移重跑。模型几何、材质和动画仍需 Three.js 加载器与浏览器 WebGL 验收。

依赖目录在刷新后需重新选择同一完整文件集，前端会由相同路径及字节重新得到同一 packageId。新包上传遇到旧后端不返回 packageId 时明确停止并提示确认后端升级，避免误用不隔离的旧命名空间。
