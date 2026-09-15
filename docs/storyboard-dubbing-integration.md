# 配音前端接入

片段编辑的配音页通过 `studioDubbing.ts` 访问 `/api/v1/studio/storyboards/dubbing`，音色选择复用 `VoiceLibraryModal`。

- 打开页签只 GET panel，不自动 initialize；空列表保持为空。
- 音色列表直接展示 panel.characters，绑定/解绑使用全剧 assetId。
- 基础设置按 panel.settings.runId 保存；单句 null 表示继承。
- 台词支持新增、编辑和删除，未匹配的角色名称保留展示。
- 模型通过 GET models?type=4 获取，检查字数、格式、音量、语速以及返回的音色语言/供应商能力。
- 点击生成时先保存当前基础设置，再提交单句生成；1/2 状态轮询 detail，3/4/5 停止。切换片段或页签停止旧轮询，重新打开从 panel 恢复任务。
- 历史通过 history 查询，成功音频可以试听和下载。下载依赖 outputUrl 支持浏览器访问及跨域读取。

验证：`npm run typecheck`；`node --test scripts/test-storyboard-dubbing-contract.mjs`。

后端文档未给出完整响应 JSON；当前使用 settings.runId、lines[].latestGeneration 和 history 的数组 data。部署联调时应核对这些响应字段。此接入不执行数据库迁移、不启动服务，也不自动创建付费配音任务。
