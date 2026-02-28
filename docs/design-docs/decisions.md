# 架构决策记录

## D001: 意图注入 vs DOM 自动化 {#d001}

**日期**：2026-02-28
**状态**：已采纳

**背景**：需要让 OpenClaw 调用 Comet 的搜索和研究能力。传统方案是模拟点击 DOM 元素（按钮、链接），逐步控制浏览器行为。

**决策**：采用意图注入方案 — 只将自然语言任务注入 Comet 的输入框，让 Comet AI 自主规划执行路径。

**理由**：
- UI 改版只需更新输入框 selector，而 DOM 自动化需要维护几十个 selector
- 充分利用 Comet Agent 的多步推理、自动引用等原生能力
- 代码复杂度从几百行 selector 降到注入 + 监听

**风险**：无法精细控制 Comet 的执行步骤。可接受 — 这正是 Agent-to-Agent 协作的设计意图。

---

## D002: execCommand 注入 vs React 状态注入 {#d002}

**日期**：2026-02-28
**状态**：已采纳（D004 更新）

**背景**：原始方案提议通过 `HTMLTextAreaElement.prototype.value.set` 劫持 React 内部状态来注入输入。

**决策**：使用 `document.execCommand("insertText")` 注入 contenteditable 元素，textarea 使用 `value` + `dispatchEvent("input")`。

**理由**：
- `execCommand("insertText")` 是 Perplexity contenteditable 输入的标准方式（comet-mcp 同样采用）
- 触发原生 input 事件，React 能正确感知变更
- 无需依赖 React 内部 SyntheticEvent 机制

**Fallback 链**：`contenteditable` → `textarea value setter`

---

## D003: playwright-core vs playwright {#d003}

**日期**：2026-02-28
**状态**：已废弃（被 D004 取代）

**背景**：选择 Playwright 包的变体。

**原决策**：使用 `playwright-core`。

**废弃原因**：见 D004。

---

## D004: chrome-remote-interface 替代 Playwright/Puppeteer {#d004}

**日期**：2026-02-28
**状态**：已采纳

**背景**：`playwright-core` 的 `connectOverCDP` 在连接 Comet 浏览器时必定超时。Comet 同时有 ~50 个 CDP targets（tabs、extensions、workers、sidecars）。Playwright 在连接阶段尝试枚举并初始化所有 targets，其中 sidecar 和 extension targets 无法响应 `Network.enable`，导致永久挂起。Puppeteer 存在同样的问题——`browser.pages()` 也会对所有 auto-attached targets 调用 `Network.enable`。

**验证过程**：
1. `playwright-core` `connectOverCDP` → 30s/60s/90s 超时，WebSocket 握手后卡在 targets 初始化
2. `puppeteer-core` `connect({ browserURL })` → WebSocket 连接成功，但 `browser.pages()` → `Network.enable` 超时
3. Puppeteer `targetFilter` 可过滤 targets 类型，但 Comet 的 tab type 是 `"tab"` 而非 `"page"`；且 `browser.pages()` 只返回 `type === "page"` 的 targets；使用 `browser.targets()` + `target.asPage()` 也无法避免初始化问题
4. `chrome-remote-interface` 直连单个 target → **2 秒内连接成功**，`Network.enable` 正常

**决策**：使用 `chrome-remote-interface`（与 [comet-mcp](https://github.com/hanzili/comet-mcp) 相同选型）。

**理由**：
- **单 target 连接**：只连接我们需要的那一个 page target，不触碰其他 49 个
- **无初始化开销**：不像 Playwright/Puppeteer 那样自动 attach + enable 所有 targets
- **经过验证**：comet-mcp 在生产环境使用同一方案，已被社区验证
- **更轻量**：无浏览器二进制依赖，包体积更小
- **API 直接**：`Runtime.evaluate`、`Input.dispatchKeyEvent`、`Network.dataReceived` 全部是原生 CDP 协议，无抽象层开销

**权衡**：
- 丧失 Playwright/Puppeteer 的高阶 API（`page.fill()`、`page.route()`、`page.waitForSelector()`）
- 需自行封装输入注入（`execCommand`）、键盘事件（`Input.dispatchKeyEvent`）、网络监听
- 可接受——实际代码已以 `page.evaluate()` 为主，迁移成本低
