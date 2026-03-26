# NexusMind 架构说明

## 1. 模块职责

- `apps/extension`
  - `background`：统一处理 AI 请求、图谱写入检索、图谱问答流式编排、设置存储、扩展命令与右键菜单
  - `content`：提取当前页面可读文本，执行页面重写、回滚与 SPA 路由隔离，处理答案片段高亮定位
  - `sidepanel`：用户交互入口（流式问答 + 图谱 + 页面重写 + 设置）
- `packages/core`
  - 领域类型定义
  - 对外配置 Schema 校验
  - API Key 加密与设置解析
- `packages/ai`
  - AI Provider 适配层（OpenAI + 流式输出协议解析）
- `packages/graph`
  - Dexie 图谱数据层（Entity / Relation / Page）
  - 实体/关系抽取与跨页归一
  - 图谱检索、一跳关系回溯、问答证据集构建
- `packages/billing`
  - 订阅状态机（free/subscription、active/canceled/refunded）
  - 调用门控、月度 500 次计量、增量包扣减
  - 取消/退款处理与风控审计日志

## 2. 关键数据流（Phase 1-5）

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

11. 用户在侧边栏选择页面重写意图并点击“应用页面重写”
12. sidepanel 读取当前意图并调用 content script 的 `NEXUSMIND_REWRITE_APPLY`
13. content 执行 DOM 重排，记录可逆变更集（隐藏/样式/移动/插入）
14. 用户点击“一键还原”或 SPA 路由切换时，content 触发回滚并恢复页面

15. 用户点击“跨页图谱问答”
16. sidepanel 建立长连接并发送 `NEXUSMIND_GRAPH_ASK_START`
17. background 先调用 `@nexusmind/billing` 执行订阅校验与权限门控
18. 门控通过后，background 调用图谱证据构建并触发 AI 流式生成
19. background 按增量分片回传 `NEXUSMIND_GRAPH_ASK_DELTA`
20. 会话完成后，background 执行调用计量并回传 `NEXUSMIND_GRAPH_ASK_COMPLETE`（答案 + 来源）
21. sidepanel 渲染 `[Sx]` 引用并可发送 `NEXUSMIND_HIGHLIGHT_TEXT` 到 content 进行正文定位
22. 若月度 500 次耗尽，background 返回超额提示并引导进入增量包购买入口

## 3. 分层边界

- UI 层不直接调用第三方 AI API
- UI 层不直接访问 IndexedDB，统一通过 background 消息桥接
- AI Provider 不感知浏览器 UI
- 配置结构统一通过 Schema 校验与默认值兜底
- 页面重写能力仅在 content 层操作 DOM，sidepanel 不直接触碰页面结构
- 流式问答采用 requestId + AbortController 控制并发与中断，避免跨请求串流污染
- 计费状态仅在 background 层持久化与变更，UI 仅消费脱敏状态
- 审计日志仅记录动作与结果，不记录 API Key、页面正文、模型响应原文

## 4. Phase 3 新增能力

- 页面重写意图：`learning / summary / distraction_free`
- 站点默认意图：`rewrite.defaultIntent + rewrite.siteIntents`
- DOM 可逆重排：支持“应用重写 / 手动还原 / 路由切换自动回滚”
- 重写重入控制：同路由同意图幂等、并发重写忙碌保护

## 5. Phase 5 新增能力

- 订阅校验消息：`NEXUSMIND_SUBSCRIPTION_VERIFY`
- 计费状态查询：`NEXUSMIND_BILLING_STATUS`
- 增量包购买：`NEXUSMIND_BILLING_BUY_TOPUP`
- 取消/退款流程：`NEXUSMIND_BILLING_CANCEL`、`NEXUSMIND_BILLING_REFUND`
- 风控策略：一分钟内高频调用触发拦截并写入审计日志

## 6. Phase 6 稳定性能力

- 流式通道稳定性：
  - background 新增断流重试（最多 2 次）与重连状态事件
  - sidepanel 支持重连提示态，避免用户误判为请求卡死
- 稳定性看板：
  - 新增 `NEXUSMIND_STABILITY_DASHBOARD` 聚合指标接口
  - 看板展示流式会话总量、成功/失败、重连恢复与最近错误
- 计费稳定性：
  - 调用计量新增 `requestId` 幂等去重，防止重试导致重复扣费
  - 风控升级为分层策略（none/degraded/blocked）并支持白名单与人工复核入口
- 兼容性回归：
  - 建立固定 SPA 回归集（注入、问答、重写、路由回滚、引用定位）
  - 发布前执行 Chrome/Edge 手工回归并输出结果文档

## 7. 后续扩展路径

- Phase 7：发布文档完善、用户手册、上架清单与版本发布自动化
