# NexusMind 变更记录

## v0.1.0 - 2026-03-24

### 新增

- 初始化 Monorepo 目录结构与 TypeScript 工程配置
- 实现 MV3 扩展 Phase 1 MVP：
  - 侧边栏容器与基础设置页
  - 当前页文本提取与 AI 问答链路
  - 右键菜单与快捷键打开侧边栏
- 增加核心包占位：
  - `@nexusmind/core`（类型、Schema、加密、设置）
  - `@nexusmind/ai`（OpenAI Provider）
  - `@nexusmind/graph`、`@nexusmind/billing`、`@nexusmind/ui` 占位
- 增加单元测试与基础发布文档

### 已知限制

- Phase 1 仅支持 OpenAI Provider
- 暂未实现图谱构建、DOM 重写、流式输出、订阅系统
