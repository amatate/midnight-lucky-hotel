# 玩法体验与质量检查 Scorecard（功能原型）

- 更新时间：2026-08-13
- 版本基线：`npm run balance`（基线参数 100,000 / 10,000）
- 基线文件：[`artifacts/balance-baseline.json`](../../artifacts/balance-baseline.json)

## 自动化检查

- `npm run verify`（现状）
  - `typecheck`: 通过
  - `test`: 31 通过（406 通过）
  - `build`: 通过
  - 注意：`vite` 测试运行中存在既有 `tests/app/App.test.tsx` 的 `window is not defined` 未处理异常（非代码新增导致，仍建议后续修复后再宣告绿色验证）
- `npm run e2e`: 通过（3/3）

## 核心平衡结果（100k base / 每路线 10k）

- 玩家可见 RTP：`0.822804`
- 路线胜率：`fruit 5.57% / chapel 10.57% / violent 5.72%`
- 路线破产率：`fruit 0.41% / chapel 0.75% / violent 0.01%`
- 首次跨 100% 中位班次：`fruit 4 / chapel 1 / violent 1`

## 交互体验摘要

- 恢复上次进度、加班续玩、离线回退、完整补完结算流程已覆盖。
- `e2e/complete-run.spec.ts` 覆盖了持久化场景 + 一次加班区块 + 总结与结账流程。

## 下一步重点

1. 清理 `tests/app/App.test.tsx` 的未处理 `window` 相关运行时异常并将 verify 全部绿。
2. 形成可复用的“真人试玩 scorecard”收集模板（至少 3 条实际手机手感路径）。
3. 再次跑一遍 `npm run verify`，确保“全量绿”作为交付门槛。
