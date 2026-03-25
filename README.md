# NexusMind

NexusMind 是一个本地优先、面向知识工作流的智能浏览器扩展项目，目标是把浏览器从信息容器升级为思维伙伴。

## 当前状态

- 版本：`v0.2.0`（Phase 2 图谱基础）
- 已完成：
  - MV3 扩展骨架（background/content script/side panel）
  - 当前页面 AI 问答闭环（用户提问 → 提取页面文本 → 调用模型 → 返回答案）
  - 基础设置页（Provider / Model / API Key / 隐私模式 / 成本阈值）
  - 图谱基础能力：IndexedDB（Dexie）实体/关系/Page 模型
  - 跨页实体归一与关系写入流水线（支持重复收录回滚）
  - 侧边栏图谱最小可视化 + 搜索回溯
  - 图谱单元/集成/性能测试（2000 节点）

## Monorepo 目录

```text
apps/
  extension/   # 浏览器扩展 (MV3)
  web/         # 官网/账户体系（预留）
packages/
  core/        # 领域模型、Schema、加密与设置
  ai/          # AI Provider 适配
  graph/       # 图谱引擎与检索（Phase 2 已落地）
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

## Phase 2 使用方式（知识织网）

1. 打开任意页面并唤起 NexusMind 侧边栏
2. 在“知识织网（Phase 2）”区域点击“收录当前页”
3. 点击“刷新图谱统计”查看实体/关系/页面计数
4. 在“图谱搜索”中输入关键词并点击“搜索并回溯”
5. 查看可视化节点与关系路径回溯文本结果

## 已实现关键约束

- 本地优先：设置与业务状态保存在 `chrome.storage.local`
- API Key 加密：保存前进行 AES-GCM 加密（详见 `docs/security.md`）
- 用户触发原则：仅在用户主动点击“提问”时请求 AI
- 图谱收录触发原则：仅在用户主动点击“收录当前页”时写入图谱
- 可扩展边界：UI 与 AI Provider 通过消息与接口解耦

## 常见问题

- `请先在设置中保存 API Key`
  - 先在侧边栏设置页填写并保存 API Key，再执行问答
- `当前页面文本提取失败`
  - 当前标签页可能尚未注入 content script，刷新页面后重试
- `图谱搜索无结果`
  - 先执行“收录当前页”，并确认关键词与页面中的实体文本一致

## 文档索引

- 架构说明：`docs/architecture.md`
- 安全策略：`docs/security.md`
- 计费设计：`docs/billing.md`
- 发布清单：`docs/release-checklist.md`
- 工程假设：`docs/assumptions.md`
- 阶段变更：`docs/changelog.md`
