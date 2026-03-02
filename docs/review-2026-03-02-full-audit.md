# Code Review Report

**Date:** 2026-03-02
**Reviewer:** Claude Code
**Scope:** 全仓库代码审计 — 架构设计、代码实现、文档一致性、测试覆盖
**Files Reviewed:** all src/ + test/ + docs/

## Summary

项目架构清晰，依赖注入和职责拆分做得好。当前无 critical issue，但有若干可靠性、可维护性和文档一致性问题值得在 Phase 4 之前修复。

## Critical Issues

无。

## Warnings

1. **模块级全局状态 `cachedConnection` 阻碍多标签复用和可测试性**
   - 文件：`src/cdp-client.ts`
   - 位置：`7`
   - 问题：`let cachedConnection` 是隐式的进程级单例。Phase 4 规划多标签复用时此设计会成为瓶颈；测试中也需要显式调用 `clearCachedConnection()` 来重置状态。
   - 建议：将连接状态封装到 `CometClient` class 中，由调用方管理生命周期。

2. **`ensureCleanHomePage` 与 `navigateToPerplexity` 职责重叠**
   - 文件：`src/comet-skill.ts:80-105` 和 `src/cdp-client.ts:113-135`
   - 问题：两处都做"导航到首页 + 等待输入框就绪"，逻辑重复且行为略有差异（`ensureCleanHomePage` 额外检查输入框是否为空）。
   - 建议：`connect()` 只负责建立 CDP 连接，页面准备逻辑统一放在 `comet-skill.ts`。

3. **`connectToTarget` 超时 timer 泄漏**
   - 文件：`src/cdp-client.ts`
   - 位置：`167-172`
   - 问题：`setTimeout` 创建的 reject timer 在连接成功后未 `clearTimeout`。虽然 resolved Promise 会忽略后续 reject，但 timer 本身会保持进程引用直到超时结束，可能导致进程延迟退出。
   - 建议：保存 timer 引用，连接成功后立即 `clearTimeout`。

4. **`waitForPageTransition` 超时静默返回**
   - 文件：`src/comet-skill.ts`
   - 位置：`107-125`
   - 问题：超时后既不报错也不返回标志位，调用方无法知道页面跳转是否真的发生。若 Comet 未响应提交，后续轮询会在旧页面上空转。
   - 建议：超时时至少 log 一条 warning 到 stderr。

5. **`stream-monitor.ts` 事件监听器类型绕过 + cleanup 过度防御**
   - 文件：`src/stream-monitor.ts`
   - 位置：`98-109`
   - 问题：`client.on("..." as any, ...)` 绕过类型检查；cleanup 中同时尝试 `off` 和 `removeListener`，属于猜测 API 行为。
   - 建议：查明 `chrome-remote-interface` 的实际事件解绑 API，只用一种；为 CDP 事件补充类型声明或留 TODO 说明原因。

6. **`getStatus` 返回类型中 `reconnectedClient` 从未被赋值**
   - 文件：`src/dom-poller.ts`
   - 位置：`196`
   - 问题：接口声明了 `reconnectedClient?: CDPClient`，但所有 code path 都不会设置该字段，属于遗留的废弃设计。
   - 建议：删除该字段。

## Backward Compatibility Violations

无。

## Performance Concerns

1. **`POLL_SCRIPT` 巨型字符串内联 JS 缺乏工具链支持**
   - 文件：`src/dom-poller.ts`
   - 位置：`12-105`
   - 问题：约 100 行 JS 以模板字符串内联，无类型检查、无 lint、无 IDE 补全。正则中的双重转义（`\\d+`）容易出错，维护成本高。
   - 建议：提取为独立 `.js` 文件，构建时以 `fs.readFileSync` 或 bundler 插件嵌入，获得 IDE 和 lint 支持。

2. **`pollForResult` 中的 keepalive hack 缺少注释**
   - 文件：`src/dom-poller.ts`
   - 位置：`138`
   - 问题：`setInterval(() => {}, 5000)` 用来阻止 Bun 进程提前退出，但没有注释说明意图，后续维护者可能误删。
   - 建议：加注释说明 why，或改用 `process.ref()` 等更语义化的方式。

## Dead Code

1. **`result-extractor.ts` 已无任何引用**
   - 文件：`src/result-extractor.ts`
   - 问题：结果提取逻辑已完全由 `dom-poller.ts` 的 `POLL_SCRIPT` 内联完成。该文件及其测试 `test/result-extractor.test.ts` 均为死代码。
   - 建议：直接删除两个文件。

2. **`sleep` 函数重复定义 3 次**
   - 文件：`src/cdp-client.ts:154`、`src/intent-injector.ts:129`、`src/dom-poller.ts:234`
   - 建议：提取到 `src/utils.ts` 统一导出。

## CLI Issues

1. **`status` 和 `connect` 命令行为完全相同**
   - 文件：`src/index.ts`
   - 位置：`57-66`
   - 问题：两个分支做一模一样的 `healthCheck()` + JSON 输出。
   - 建议：合并，或让 `connect` 做一次真正的 `connect()` + `disconnect()` 以验证完整连接链路。

## Documentation Drift

1. **`PLANS.md` Phase 3 状态严重过时**
   - 文件：`docs/PLANS.md`
   - 问题：Phase 3（WebSocket 监控 + 流式输出）已在 commit `374452a` 中实现完毕，但文档仍标记为"未开始"且所有子项为 `[ ]`。
   - 建议：将 Phase 3 标记为"已完成"，勾选所有已实现子项。

2. **`PLANS.md` Phase 2 描述与实际实现不符**
   - 文件：`docs/PLANS.md`
   - 位置：`28`
   - 问题：描述写的是 `page.fill() + page.press('Enter')`，实际已改为 `ClipboardEvent paste + KeyboardEvent Enter`。
   - 建议：更新描述以匹配当前实现。

3. **`README.md` 的 bin 入口兼容性**
   - 文件：`package.json` + `README.md`
   - 问题：`bin` 字段指向 `src/index.ts`，仅 Bun 环境可直接执行。若有人用 Node 安装会报错。
   - 建议：在 README 中明确标注 Bun-only，或添加构建步骤输出 JS。

## Test Coverage Gaps

1. **零集成测试**
   - 62 个 test 全部是纯 mock 单元测试，对 `POLL_SCRIPT` 状态判断、DOM 提取等核心逻辑的真实行为没有验证。
   - 建议：至少用 JSDOM 对 `POLL_SCRIPT` 的状态判断逻辑做 snapshot 测试。

2. **异常路径覆盖不足**
   - `connect` 重试 3 次后失败、`ensureCleanHomePage` 超时抛错、`pollForResult` 重连成功/失败 — 均缺少测试。
   - 建议：补充这些 error path 的单元测试。

---

## Action Items

| 优先级 | 项目 | 文件 | 类型 |
|--------|------|------|------|
| **P0** | 更新 PLANS.md Phase 3 状态 + Phase 2 描述 | `docs/PLANS.md` | 文档 |
| **P0** | 删除死代码 `result-extractor.ts` 及其测试 | `src/result-extractor.ts`, `test/result-extractor.test.ts` | 清理 |
| **P1** | 统一 `sleep` 到 `src/utils.ts` | `src/*.ts` | 重构 |
| **P1** | 修复 `connectToTarget` timer 泄漏 | `src/cdp-client.ts` | Bug |
| **P1** | `waitForPageTransition` 超时 log warning | `src/comet-skill.ts` | 可观测性 |
| **P1** | 删除 `getStatus` 中未使用的 `reconnectedClient` 字段 | `src/dom-poller.ts` | 清理 |
| **P2** | 合并 `ensureCleanHomePage` 和 `navigateToPerplexity` | `src/comet-skill.ts`, `src/cdp-client.ts` | 重构 |
| **P2** | 统一 `status`/`connect` CLI 命令行为 | `src/index.ts` | 功能 |
| **P2** | `stream-monitor` cleanup 只用一种解绑方式 | `src/stream-monitor.ts` | 清理 |
| **P2** | 提取 `POLL_SCRIPT` 为独立文件 | `src/dom-poller.ts` | 可维护性 |
| **P3** | 封装 `CometClient` class 替代模块级单例 | `src/cdp-client.ts` | 架构 |
| **P3** | 补充 POLL_SCRIPT 的 JSDOM 测试 | `test/poll-script.test.ts` | 测试 |
| **P3** | 补充异常路径测试（重试失败、超时、重连） | `test/*.test.ts` | 测试 |

## Fix Verification (2026-03-02)

### 结论

本报告中列出的问题均已复核；已确认存在的问题均已完成代码或文档修复。

### 落地修复清单

- [x] `cachedConnection` 全局状态封装为 `CometClient`，通过实例管理连接生命周期（`src/cdp-client.ts`）
- [x] 页面准备职责统一到 `comet-skill`，`cdp-client.connect()` 不再做导航与输入框等待
- [x] `connectToTarget` 超时 timer 在成功/失败路径都执行 `clearTimeout`
- [x] `waitForPageTransition` 超时写入 stderr warning，避免静默
- [x] `stream-monitor` 去除 `as any` 监听与双通道 cleanup，改为 typed subscribe + unsubscribe
- [x] 删除 `getStatus` 中未使用的 `reconnectedClient` 返回字段
- [x] 将 `POLL_SCRIPT` 提取为 `src/poll-script.ts`
- [x] 为 keepalive 补充注释说明用途
- [x] 删除死代码 `src/result-extractor.ts` 及 `test/result-extractor.test.ts`
- [x] 将重复 `sleep` 提取到 `src/utils.ts` 并统一复用
- [x] `connect` CLI 命令改为真实 connect/disconnect 链路验证
- [x] 更新 `docs/PLANS.md`（Phase 3 状态与 Phase 2 注入描述）
- [x] 更新 `README.md`（明确 Bun-only）

### 新增测试覆盖

- [x] `POLL_SCRIPT` 的 JSDOM 行为测试（`test/poll-script.test.ts`）
- [x] 重连成功/失败路径测试（`test/dom-poller.test.ts`）
- [x] 首页清理超时抛错测试（`test/comet-skill.test.ts`）
- [x] CDP 连接重试失败测试（`test/cdp-client.test.ts`）

### 验证结果

- `bun test`：75 passed, 0 failed
- `bun run typecheck`：通过
