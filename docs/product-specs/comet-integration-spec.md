# Comet-OpenClaw 集成规格

> 源自原始 PDF 方案文档，结构化整理。

## 核心理念

不重复实现 Comet 已有的 Agentic Browsing 能力，通过 CDP 实现"意图注入"和"状态监控"，让 OpenClaw 能够调用 Comet 的原生智能浏览功能。

## 三层架构

1. **OpenClaw Agent Loop** — 负责任务规划和 Skill 调度
2. **Perplexity Skill (CDP 控制层)** — 通过 CDP 与 Comet 通信
3. **Comet Browser** — 执行实际的浏览和 AI 推理任务

## 数据流

```
OpenClaw 下发任务指令
↓
[意图注入层] 将自然语言任务注入 Comet Assistant 输入框
↓
Comet AI 自主规划执行路径（云端 AI + 本地 Agent）
↓
[状态监控层] 实时拦截 SSE/WebSocket 通道获取执行状态
↓
[结果提取层] 任务完成后从 DOM 提取结构化结果
↓
返回给 OpenClaw 用于后续任务
```

## CDP 连接

Comet 基于 Chromium 内核，支持标准 CDP 协议。启动时开启远程调试端口：

```bash
# macOS
/Applications/Comet.app/Contents/MacOS/Comet \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --no-first-run
```

通过 `http://localhost:9222/json` 验证 CDP 端点。
Playwright 连接后复用已登录的用户 session，无需处理鉴权。

## 暴露的工具

| 工具 | 描述 | 预期耗时 |
|------|------|----------|
| `search` | 快速搜索 + 引用 | 10-30 秒 |
| `deep_research` | 多步研究报告 | 3-5 分钟 |
| `agent_task` | 通用 Agent 任务 | 视任务而定 |

## SSE 流拦截

拦截 Perplexity SSE 数据流获取推理结果：
- 路由匹配：`**/rest/sse/**`, `**/api/answer**`
- 解析 `data:` 行中的 JSON chunk
- `answer_chunk` 类型为回答片段，`task_complete` 为完成信号

## WebSocket 监控

监控 Comet Agent 的 WebSocket 通信（`wss://pplx.ai/agent`）：
- `action_result` 方法表示 Agent 执行状态
- `research_progress` 类型表示 Deep Research 进度

## 安全性

CDP 操作在 Comet 看来等同于用户手动操作，不触发安全防护机制。Comet 的安全防护针对"外部网页内容攻击 AI"，而非本地 CDP 控制。

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 速率限制 | Skill 层实现请求队列和间隔控制 |
| 前端代码变化 | 优先 Playwright 标准 API，selector fallback 链 |
| WebSocket 加密 | SSE 流已足够获取完整结果，WebSocket 仅用于进度 |
