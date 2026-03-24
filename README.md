# NexusMind

NexusMind 是一个本地优先、面向知识工作流的智能浏览器扩展项目，目标是把浏览器从信息容器升级为思维伙伴。

## 当前状态

- 版本：`v0.1.0`（Phase 1 MVP）
- 已完成：
  - MV3 扩展骨架（background/content script/side panel）
  - 当前页面 AI 问答闭环（用户提问 → 提取页面文本 → 调用模型 → 返回答案）
  - 基础设置页（Provider / Model / API Key / 隐私模式 / 成本阈值）
  - Monorepo 基础目录与核心包占位（graph / billing / ui）

## Monorepo 目录

```text
apps/
  extension/   # 浏览器扩展 (MV3)
  web/         # 官网/账户体系（预留）
packages/
  core/        # 领域模型、Schema、加密与设置
  ai/          # AI Provider 适配
  graph/       # 图谱引擎（占位）
  billing/     # 订阅与额度（基础占位）
  ui/          # 复用 UI（占位）
docs/          # 架构、安全、计费、发布、假设、变更
tests/         # 单元/集成测试
```

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 类型检查

```bash
npm run typecheck
```

3. 运行测试

```bash
npm test
```

4. 构建扩展

```bash
npm run build
```

5. 在 Chrome/Edge 加载扩展
   - 打开扩展管理页面
   - 启用开发者模式
   - 选择 `apps/extension/dist` 目录进行加载

## 已实现关键约束

- 本地优先：设置与业务状态保存在 `chrome.storage.local`
- API Key 加密：保存前进行 AES-GCM 加密（详见 `docs/security.md`）
- 用户触发原则：仅在用户主动点击“提问”时请求 AI
- 可扩展边界：UI 与 AI Provider 通过消息与接口解耦

## 常见问题

- `请先在设置中保存 API Key`
  - 先在侧边栏设置页填写并保存 API Key，再执行问答
- `当前页面文本提取失败`
  - 当前标签页可能尚未注入 content script，刷新页面后重试

## 文档索引

- 架构说明：`docs/architecture.md`
- 安全策略：`docs/security.md`
- 计费设计：`docs/billing.md`
- 发布清单：`docs/release-checklist.md`
- 工程假设：`docs/assumptions.md`
- 阶段变更：`docs/changelog.md`
