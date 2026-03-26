# NexusMind 发布检查清单

## 自动化执行入口（Phase 7）

- 统一门禁命令：`npm run ci:gate`
- 结果产物：`docs/release-artifacts/phase7-release-gate.json`
- CI 工作流：
  - `.github/workflows/ci.yml`
  - `.github/workflows/browser-regression.yml`

## 代码质量

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `npm run build` 通过
- [ ] `npm run test:e2e:extension` 通过（Chromium/Edge）

## 安全与隐私

- [ ] API Key 不以明文持久化
- [ ] 无敏感日志输出
- [ ] 用户触发前不调用 AI 服务
- [ ] 审计日志不包含 API Key/页面正文/退款敏感明文
- [ ] 退款与取消流程状态可追踪且可回滚

## 商业化能力

- [ ] 订阅校验门控生效（免费/订阅双轨）
- [ ] 月度 500 次计量准确（完成会话才计费）
- [ ] 超额后购买入口可达，增量包扣减正确
- [ ] 风控拦截与解读提示正确

## 兼容性

- [ ] Chrome 自动化回归通过（CI 矩阵）
- [ ] Edge 自动化回归通过（CI 矩阵）
- [ ] SPA 站点注入与问答链路验证
- [ ] 按 `docs/phase6-regression-report.md` 固定回归集完成回归

## 稳定性门禁（Phase 6）

- [ ] 流式重连指标可观测（总量/成功/失败/重连恢复/最近错误）
- [ ] 流式断流重连策略验证通过（最多 2 次重连）
- [ ] requestId 幂等计量验证通过（重复完成不重复扣费）
- [ ] 风控分层验证通过（none/degraded/blocked + 白名单 + 人工复核）
- [ ] 重写性能 ≤ 1s、图谱 2000 节点性能测试通过

## 文档

- [ ] README 更新
- [ ] architecture/security/billing 文档同步
- [ ] user-manual / developer-handbook 同步
- [ ] changelog 更新
