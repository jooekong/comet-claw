# Comet-Claw — 架构设计

通过 CDP 将 OpenClaw Agent 与 Perplexity Comet 浏览器连接，实现 Agent-to-Agent 协作。

> 最后核对时间：2026-03-02
> 本文档严格区分"已实现"与"规划中"，避免状态漂移。

## 设计原则

- 意图注入，非 UI 自动化 — 只下发"what"，让 Comet 决定"how"
- DOM 轮询为主 — 通过 Runtime.evaluate 轮询页面状态和结果
- 最小化 UI 依赖 — 仅依赖 contenteditable 输入框一个稳定元素
- 纯 JS 注入优先 — 通过 ClipboardEvent/KeyboardEvent 操作 Lexical 编辑器，不用 CDP Input.dispatch*。原因：Comet 是桌面应用，用户随时可能切走窗口，CDP Input 在窗口失焦时会静默失败；JS 事件在后台也能正常触发

## 能力状态总览

| 能力 | 状态 | 说明 |
|------|------|------|
| CDP 连接管理 | 已实现 | `src/cdp-client.ts`，含指数退避重连 |
| 意图注入 | 已实现 | `src/intent-injector.ts`，ClipboardEvent paste + KeyboardEvent Enter |
| DOM 轮询 | 已实现 | `src/dom-poller.ts`，状态检测 + 结果提取 |
| SSE 流拦截 | 已实现 | `src/stream-monitor.ts` |
| WebSocket 监控 | 已实现 | `src/stream-monitor.ts`（Agent 动作解析） |
| Skill 编排 | 已实现 | `src/comet-skill.ts`，页面状态管理 + 依赖注入 |
| CLI 入口 | 已实现 | `src/index.ts`，JSON stdout 输出 |
| OpenClaw Skill | 已实现 | `skills/comet-perplexity/SKILL.md` |
| 请求队列 | 已实现 | `src/request-queue.ts`，串行化 + cooldown |
| 单元测试 | 已实现 | 见 `test/*.test.ts` |

## 架构概览

```
┌──────────────────────────────────────────────┐
│              OpenClaw Agent                  │
│         (bash tool → comet-claw CLI)         │
└──────────────────┬───────────────────────────┘
                   │
┌──────────────────▼───────────────────────────┐
│              comet-claw CLI                  │
│  ┌─────────────────────────────────────────┐ │
│  │ Comet Skill Orchestrator                │ │
│  │ (inject → monitor → extract)            │ │
│  └─────────────────────────────────────────┘ │
│  ┌────────────┐ ┌───────────┐ ┌───────────┐ │
│  │ CDP Client │ │  Intent   │ │  Stream   │ │
│  │            │ │ Injector  │ │  Monitor  │ │
│  └─────┬──────┘ └─────┬─────┘ └─────┬─────┘ │
│        │              │             │        │
│  ┌─────▼──────────────▼─────────────▼─────┐  │
│  │       DOM Poller / Extractor           │  │
│  └────────────────────────────────────────┘  │
└──────────────────┬───────────────────────────┘
                   │ CDP (connectOverCDP :9222)
┌──────────────────▼───────────────────────────┐
│            Comet Browser                     │
│        (Perplexity Agentic Browsing)         │
└──────────────────────────────────────────────┘
```

## 数据流

1. OpenClaw Agent 通过 `bash` 工具执行 `comet-claw search "query"`
2. CLI 通过 `chrome-remote-interface` CDP 连接 Comet（端口 9222）
3. Skill 编排器先导航到首页确保干净输入状态
4. Intent Injector 通过 ClipboardEvent paste 注入查询文本，KeyboardEvent 提交
5. DOM Poller 通过 Runtime.evaluate 轮询页面状态（idle/working/completed）
6. DOM Poller 在轮询阶段直接提取结构化结果（文本 + 引用）
7. CLI 将 JSON 结果输出到 stdout，返回给 OpenClaw

## 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| CDP Client | `src/cdp-client.ts` | 连接池管理、多标签复用、Target 选择、健康检查、重连 |
| Intent Injector | `src/intent-injector.ts` | 任务注入（paste + Enter），模式切换 |
| DOM Poller | `src/dom-poller.ts` | 状态轮询（idle/working/completed），结果提取 |
| Poll Script | `src/poll-script.ts` | 轮询脚本模板（从 `dom-poller.ts` 引用） |
| Stream Monitor | `src/stream-monitor.ts` | SSE 拦截 + WebSocket 监控 |
| Request Queue | `src/request-queue.ts` | 请求串行化 + 速率限制 |
| Comet Skill | `src/comet-skill.ts` | 编排入口：页面管理 → 注入 → 轮询 |
| CLI | `src/index.ts` | 命令行解析 + JSON 输出 |
| Logger | `src/logger.ts` | 结构化日志（level 控制，`COMET_LOG` 环境变量） |
| Utils | `src/utils.ts` | 通用工具函数（如 sleep） |

## 已知问题

1. ~~Selector 硬编码~~ — 已增加 auto-discover fallback（`findInput` 启发式扫描）
2. ~~无真实 Comet 集成测试~~ — 已创建 `test/integration/smoke.test.ts`（需 Comet 运行时手动执行 `bun run test:integration`）
3. ~~无请求队列~~ — 已通过 `RequestQueue` 解决（串行执行 + 2s cooldown）

## 演进路线

统一规划与阶段状态见 `docs/PLANS.md`。
