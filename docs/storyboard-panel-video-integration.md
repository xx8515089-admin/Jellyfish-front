# 图片与分镜图生视频流程

依据新版 `storyboard-panel-video-flow (1).md` 接入三种 scope：whole_image、single_panel、all_panels。

## 当前行为

- 读取 images/detail。无 panels 时默认 whole_image，隐藏分镜选择、刷新标注与校准控件；有 panels 时提供整图、单格和全部分镜选项。
- whole_image 的提示词及视频请求都不传 panelId、panelRevision。返回 firstFramePanel=null 时可正常编辑提示词和生成视频，首帧展示整张图片。
- 分镜提示词根据图片 status=3、有效选择及描述存在判断，不检查 panelStatus=confirmed，也不需要 bounds。不会自动写入确认状态。
- 分镜视频只校验提示词响应的 firstFramePanel.bounds：坐标为有限数、尺寸为正、范围在原图内。坐标缺失或无效时提示校准，保留可编辑提示词，禁止视频提交。实际像素、文件大小和模型尺寸要求仍由后端校验。
- 生成提示词后保存完整选择快照；提交只修改 prompt 和风格，其他字段沿用快照。返回模型 ID 生效并重新报价。换图、换格、参数或修订变更时清空旧稿，迟到响应被丢弃。
- whole_image 显示“识图生成提示词，按文本模型用量计费”；只有 panel_template 返回显示“模板编排，不额外扣积分”。不自行估算识图费用，不把识图当免费。
- 提示词请求使用 generated fetch client，无短超时限制，能够等待后端 120 秒策略；请求期间生成按钮禁用，不自动重试。关闭或改变选择会取消前端等待，不代表后端任务被取消。
- 视频沿用 imagetovideo/generate、videos/detail；仍按 id 查询、成功刷新历史，关闭弹窗不取消后台任务，不自动重发不确定的计费请求。

## 当前边界与验证

- 分镜校准接口仍缺引用的 storyboard-image-panels-frontend.md，当前只提示缺失坐标并允许刷新，不猜测检测或标注写入接口；这不阻碍 whole_image 和具有有效坐标的分镜视频。
- OpenAPI 同步命令在缺少显式地址时退出，不访问废弃接口。客户端根据提供文档的本地契约生成。
- 已验证整图不带分镜字段、detected 无坐标可生成提示词、空描述/错误选择/过多镜头阻止提示词及裁剪坐标边界。未启动服务或发起真实计费生成。
