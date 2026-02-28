# Comet-Claw — 架构设计

通过 CDP 将 OpenClaw Agent 与 Perplexity Comet 浏览器连接，实现 Agent-to-Agent 协作。

> 最后核对时间：2026-02-28
> 本文档严格区分"已实现"与"规划中"，避免状态漂移。

## 设计原则

- 意图注入，非 UI 自动化 — 只下发"what"，让 Comet 决定"how"
- 网络层监控优先于 DOM 轮询 — SSE/WebSocket 拦截获取实时状态
- 最小化 UI 依赖 — 仅依赖输入框一个稳定元素
- Playwright 标准 API 优先 — 避免 React 内部状态 hack

## 能力状态总览

| 能力 | 状态 | 说明 |
|------|------|------|
| CDP 连接管理 | 规划中 | `src/cdp-client.ts` |
| 意图注入 | 规划中 | `src/intent-injector.ts` |
| SSE 流拦截 | 规划中 | `src/stream-monitor.ts` |
| WebSocket 监控 | 规划中 | `src/stream-monitor.ts` |
| 结果提取 | 规划中 | `src/result-extractor.ts` |
| CLI 入口 | 规划中 | `src/index.ts` |
| OpenClaw Skill | 规划中 | `skills/comet-perplexity/SKILL.md` |

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
│  │         Result Extractor               │  │
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
2. CLI 通过 Playwright `connectOverCDP` 连接 Comet（端口 9222）
3. Intent Injector 使用 `page.fill()` + `page.press('Enter')` 注入查询
4. Stream Monitor 通过 `page.route()` 拦截 SSE 流获取回答内容
5. Stream Monitor 通过 `page.on('websocket')` 监控 Agent 执行进度
6. Result Extractor 从 DOM 提取结构化结果（文本 + 引用）
7. CLI 将 JSON 结果输出到 stdout，返回给 OpenClaw

## 模块职责

| 模块 | 文件 | 职责 |
|------|------|------|
| CDP Client | `src/cdp-client.ts` | 连接管理、健康检查、重连 |
| Intent Injector | `src/intent-injector.ts` | 任务注入（search/research/agent） |
| Stream Monitor | `src/stream-monitor.ts` | SSE 拦截 + WebSocket 监控 |
| Result Extractor | `src/result-extractor.ts` | DOM 结果提取和结构化 |
| Comet Skill | `src/comet-skill.ts` | 编排以上模块的统一入口 |
| CLI | `src/index.ts` | 命令行解析 + JSON 输出 |

## 已知问题

暂无（项目初始化阶段）。

## 演进路线

统一规划与阶段状态见 `docs/PLANS.md`。
