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

## D002: Playwright 标准 API vs React 状态注入 {#d002}

**日期**：2026-02-28
**状态**：已采纳

**背景**：原始方案提议通过 `HTMLTextAreaElement.prototype.value.set` 劫持 React 内部状态来注入输入。

**决策**：优先使用 Playwright 标准 API（`page.fill()` + `page.press()`），将 React setter 作为最后的 fallback。

**理由**：
- `page.fill()` 是 Playwright 的公开 API，跨版本稳定
- React 内部状态注入依赖 `SyntheticEvent` 机制，可能随 React 版本变化
- 标准 API 已经处理了 focus、clear、input event dispatch

**Fallback 链**：`page.fill()` → `page.type()` → React setter

---

## D003: playwright-core vs playwright {#d003}

**日期**：2026-02-28
**状态**：已采纳

**背景**：选择 Playwright 包的变体。

**决策**：使用 `playwright-core`（纯 API 包，不含浏览器二进制）。

**理由**：
- 我们只需 `connectOverCDP` 连接已运行的 Comet 浏览器
- 不需要下载 Chromium/Firefox/WebKit（节省 ~500MB）
- 安装更快，CI 更轻量
