# NexusMind 变更记录

## v0.2.0 - 2026-03-25

### 新增

- 实现 `@nexusmind/graph` Phase 2 基础能力：
  - IndexedDB（Dexie）三类模型：Entity / Relation / Page
  - 实体/关系抽取、跨页归一、关系去重写入
  - 页面重复收录回滚（旧引用回收后重建）
- 扩展后台新增图谱消息协议：
  - `NEXUSMIND_INDEX_PAGE`
  - `NEXUSMIND_GRAPH_SEARCH`
  - `NEXUSMIND_GRAPH_STATS`
  - `NEXUSMIND_GRAPH_CLEAR`
- 侧边栏新增知识织网面板：
  - 收录当前页
  - 图谱统计
  - 关键词检索与关系回溯
  - 最小节点可视化
- 新增图谱测试：
  - 抽取单元测试
  - 跨页归一集成测试
  - 2000 节点检索性能基准测试

### 质量验证

- `npm run typecheck` 通过
- `npm test` 通过（含图谱性能测试）
- `npm run build` 通过（扩展可构建）

### 已知限制

- 实体抽取仍为启发式策略，复杂语义关系将在 Phase 4 增强
- 图谱可视化为最小版本，交互布局将在后续阶段升级

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
