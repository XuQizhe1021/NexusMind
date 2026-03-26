# NexusMind 开发人员手册（Phase 7）

## 1. 开发目标

- 保持“本地优先、用户触发、可回滚”的架构约束。
- 在不破坏模块边界的前提下持续演进三大模块：知识织网、页面重写、AI 伴侣。
- 所有改动必须可验证、可回滚、可追溯。

## 2. 模块边界

- `apps/extension`：浏览器交互层，负责消息编排与 UI 呈现。
- `packages/core`：类型、Schema、设置、加密能力。
- `packages/ai`：Provider 适配和流式协议。
- `packages/graph`：图谱抽取、归一、检索、问答证据。
- `packages/billing`：订阅校验、计量、风控、退款取消。
- `packages/ui`：可复用 UI 组件。

## 3. 本地开发流程

1. 安装依赖：`npm install`
2. 类型检查：`npm run typecheck`
3. 单元与集成测试：`npm test`
4. 构建扩展：`npm run build`
5. 浏览器回归：`npm run test:e2e:extension`

## 4. CI 与发布门禁

- 基础门禁：`.github/workflows/ci.yml`
  - `typecheck`、`test`、`build`
- 浏览器门禁：`.github/workflows/browser-regression.yml`
  - Chromium（ubuntu）+ Edge（windows）矩阵
- 本地一键门禁：`npm run ci:gate`
  - 产物输出到 `docs/release-artifacts/phase7-release-gate.json`

## 5. 代码与测试规范

- TypeScript 严格模式，不引入无边界 `any`。
- 对外接口必须有 Schema 校验与错误口径。
- 核心复杂逻辑补充中文注释，说明“为什么”。
- 至少覆盖：单元测试 + 集成测试 + E2E 关键路径 + 性能回归。

## 6. 商业化签名校验约定

- 订阅激活使用服务端签名 JWT（RS256），拒绝本地前缀规则激活。
- 关键字段：`iss`、`aud`、`sub`、`plan`、`status`、`iat`、`exp`、`whitelist`。
- 通过 `kid` 匹配公钥进行验签，失败立即阻断激活。

## 7. 回滚策略

- 代码回滚：按单一目的提交粒度回退。
- 发布回滚：保留上一版构建产物与发布检查报告。
- 功能回滚：
  - 页面重写可在运行时“一键还原”
  - 订阅签名若出现密钥问题可通过追加 `kid` 公钥恢复兼容
