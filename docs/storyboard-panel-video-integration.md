# 已确认分镜的图生视频流程

图生视频弹窗读取 `images/detail?id=<imageGenerationId>` 的 `panelStatus`、`panelRevision` 和 `panels`，显示按 `panelIndex` 排序的分镜选择列表。只有图片成功且标注 confirmed 时允许生成提示词。

单格提交 scope=single_panel、panelId、panelRevision；全部提交 scope=all_panels、panelRevision，不携带 panelId。全部模式是一个视频，按总时长报价，并提示首格之外的画面不能保证逐格复现。

调用 `imagetovideo/prompts/generate` 后保存完整返回快照。正文可编辑，生成视频请求使用快照中的图片、范围、修订、模型、分辨率和时长。改变选择或参数会清空旧稿；迟到的提示词响应不会覆盖新选择。首帧预览根据返回的 firstFramePanel.bounds 在浏览器显示，正式裁剪由后端执行。

视频继续使用 `imagetovideo/generate`，取响应 id 轮询 `videos/detail`。成功后刷新父页面历史，关闭弹窗停止前端查询；不取消后台任务，不自动重发不确定的计费请求。

## 当前接入边界

- 所提供文档引用的 `storyboard-image-panels-frontend.md` 未在本地找到，目前未接检测、人工校准及确认接口。pending 可手动刷新；detected、needs_review、unavailable 显示需先完成标注的提示并阻止提交，不会静默确认，也不会回退成整图生视频。
- 未配置有效 OpenAPI 文档地址，同步命令在联网前退出。本次依据用户提供契约更新并生成 ImageToVideoService 和 DTO，没有调用已废弃的文档接口。
- 类型检查和请求构造回归用于验证前端；未启动服务或发起真实计费任务。
