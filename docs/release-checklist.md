# NexusMind 发布检查清单

## 代码质量

- [ ] `npm run typecheck` 通过
- [ ] `npm test` 通过
- [ ] `npm run build` 通过

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

- [ ] Chrome 加载验证
- [ ] Edge 加载验证
- [ ] SPA 站点注入与问答链路验证

## 文档

- [ ] README 更新
- [ ] architecture/security/billing 文档同步
- [ ] changelog 更新
