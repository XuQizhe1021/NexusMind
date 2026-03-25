# NexusMind 架构说明

## 1. 模块职责

- `apps/extension`
  - `background`：统一处理 AI 请求、图谱写入检索、设置存储、扩展命令与右键菜单
  - `content`：提取当前页面可读文本，作为问答上下文输入
  - `sidepanel`：用户交互入口（问答 + 图谱 + 设置）
- `packages/core`
  - 领域类型定义
  - 对外配置 Schema 校验
  - API Key 加密与设置解析
- `packages/ai`
  - AI Provider 适配层（Phase 1 实现 OpenAI）
- `packages/graph`
  - Dexie 图谱数据层（Entity / Relation / Page）
  - 实体/关系抽取与跨页归一
  - 图谱检索与一跳关系回溯
- `packages/billing`
  - 配额判断占位（Phase 5 扩展）

## 2. 关键数据流（Phase 1-2）

1. 用户在侧边栏点击“提问”
2. sidepanel 调用 content script 获取当前页文本
3. sidepanel 发送 `NEXUSMIND_ASK` 到 background
4. background 解密 API Key，调用 AI Provider
5. background 回传答案到 sidepanel
6. sidepanel 渲染问答结果

7. 用户在侧边栏点击“收录当前页”
8. sidepanel 获取 `url + title + pageText` 并发送 `NEXUSMIND_INDEX_PAGE`
9. background 调用 `@nexusmind/graph` 执行抽取、归一与写入
10. sidepanel 通过 `NEXUSMIND_GRAPH_STATS / NEXUSMIND_GRAPH_SEARCH` 展示图谱统计与回溯

## 3. 分层边界

- UI 层不直接调用第三方 AI API
- UI 层不直接访问 IndexedDB，统一通过 background 消息桥接
- AI Provider 不感知浏览器 UI
- 配置结构统一通过 Schema 校验与默认值兜底

## 4. 后续扩展路径

- Phase 3：增加页面重写策略与 DOM 回滚机制
- Phase 4：引入流式问答与答案高亮联动
- Phase 5：接入订阅鉴权、调用计数、超额购买入口
