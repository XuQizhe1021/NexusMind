# NexusMind Phase 6 固定回归集与结果

## 1. 固定回归集（Chrome/Edge + SPA）

- R1 扩展加载：Chrome/Edge 成功加载 `apps/extension/dist`
- R2 当前页问答：提问、流式返回、主动中断
- R3 断流重连：模拟网络抖动，观察重连提示与最终结果
- R4 图谱收录：收录当前页并刷新统计
- R5 图谱问答：跨页问答、来源卡片、正文定位
- R6 页面重写：学习/摘要/去干扰三意图应用
- R7 路由回滚：SPA 路由切换后自动还原
- R8 商业化链路：订阅校验、增量包、退款取消
- R9 风控分层：degraded/block 触发、白名单绕过、人工复核入口
- R10 稳定性看板：流式成功率、重连恢复、最近错误摘要

## 2. 自动化回归映射

- `tests/rewrite.rollback.integration.test.ts`：R6/R7
- `tests/page.highlight.e2e.test.ts`：R5
- `tests/ai.streaming.integration.test.ts`：R2/R3（流式与中断）
- `tests/billing.test.ts`：R8/R9（含幂等计量、分层风控、白名单、人工复核）
- `tests/rewrite.performance.test.ts`：性能门禁（重写 ≤1s）
- `tests/graph.performance.test.ts`：性能门禁（2000 节点）

## 3. 本轮回归结论

- 自动化测试：通过（见本次命令输出）
- 手工回归建议集：已固化，可用于每次发布前复用
- 未决项：跨浏览器 E2E 自动化矩阵仍未接入 CI，进入 Phase 7
