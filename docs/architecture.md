# NexusMind 架构说明

## 1. 模块职责

- `apps/extension`
  - `background`：统一处理 AI 请求、设置存储、扩展命令与右键菜单
  - `content`：提取当前页面可读文本，作为问答上下文输入
  - `sidepanel`：用户交互入口（问答 + 设置）
- `packages/core`
  - 领域类型定义
  - 对外配置 Schema 校验
  - API Key 加密与设置解析
- `packages/ai`
  - AI Provider 适配层（Phase 1 实现 OpenAI）
- `packages/graph`
  - 图谱数据结构占位（Phase 2 扩展）
- `packages/billing`
  - 配额判断占位（Phase 5 扩展）

## 2. 关键数据流（Phase 1）

1. 用户在侧边栏点击“提问”
2. sidepanel 调用 content script 获取当前页文本
3. sidepanel 发送 `NEXUSMIND_ASK` 到 background
4. background 解密 API Key，调用 AI Provider
5. background 回传答案到 sidepanel
6. sidepanel 渲染问答结果

## 3. 分层边界

- UI 层不直接调用第三方 AI API
- AI Provider 不感知浏览器 UI
- 配置结构统一通过 Schema 校验与默认值兜底

## 4. 后续扩展路径

- Phase 2：引入 IndexedDB 图谱存储与跨页合并
- Phase 3：增加页面重写策略与 DOM 回滚机制
- Phase 4：引入流式问答与答案高亮联动
- Phase 5：接入订阅鉴权、调用计数、超额购买入口
