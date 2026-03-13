# AGENTS.md — 工作协议

> 这是地图，不是手册。从这里出发，按指针深入。

---

## 文档地图

### 必读（每次开始工作前）

| 文档 | 职责 |
|------|------|
| `ARCHITECTURE.md` | 系统现状：架构、模块结构、已实现能力、已知问题 |
| `docs/PLANS.md` | Phase 总览 + 当前焦点 + 当前 sprint 任务 |

### 按需读

| 文档 | 何时读 |
|------|--------|
| `docs/DESIGN.md` → `docs/design-docs/` | 做架构决策前 |
| `docs/exec-plans/active/` | 执行具体任务时 |
| `docs/exec-plans/completed/` | 追溯历史决策时 |
| `docs/product-specs/` | 开发新功能前 |
| `docs/DEVELOPMENT.md` | 查阅代码规范、技术栈、项目结构时 |

---

## 完成任务后必须更新

| 事件 | 更新哪里 |
|------|----------|
| 实现新功能 / 修改架构 | `ARCHITECTURE.md` |
| 完成 sprint 任务 | `docs/PLANS.md`（勾选 + Phase 状态） |
| 做了架构/设计决策 | `docs/design-docs/decisions.md` |
| 制定新实现计划 | 新建 `docs/exec-plans/active/<主题>.md` |
| 计划执行完毕 | 移至 `docs/exec-plans/completed/`，更新 `docs/PLANS.md` |

**禁止**：把规划中的能力写成已实现。

---

## 基础约定

- 使用中文回复
- 修改文件前先展示 diff 预览，不确定时询问
- 任务完成后询问是否提交，给出变更摘要和建议 commit message，等待确认后执行，不自动 push

> 没有写进 repo 的知识对 Agent 不存在。

---

## Build & Test

```bash
bun install               # 安装依赖
bun test                  # 单元测试
bun run test:integration  # 集成测试（需运行中的 Comet）
bun run typecheck         # tsc --noEmit
bun run dev               # watch mode
```

---

## 源码结构（src/）

| 文件 | 职责 |
|------|------|
| `index.ts` | CLI 入口，参数解析，JSON stdout |
| `comet-skill.ts` | 编排器：navigate → inject → poll → extract |
| `cdp-client.ts` | CDP 连接池，Target 选择，指数退避重连 |
| `intent-injector.ts` | ClipboardEvent paste + KeyboardEvent Enter |
| `dom-poller.ts` | 状态轮询 (idle/working/completed) + 结果提取 |
| `poll-script.ts` | 轮询脚本模板（dom-poller 引用） |
| `stream-monitor.ts` | SSE 拦截 + WebSocket 监控 |
| `request-queue.ts` | 串行执行 + 速率限制 |
| `logger.ts` | 结构化日志（COMET_LOG 环境变量） |
| `types.ts` | 共享类型 + 默认配置 |
| `utils.ts` | 工具函数 |

---

## 编码约定

- Bun-only，bin 直接指向 .ts 源码
- JSON stdout 输出，日志走 stderr

---

## Safety Rails

- NEVER 在 stdout 输出非 JSON 内容（破坏 OpenClaw agent 解析）
- ALWAYS 在 finally 中调用 disconnect() 关闭 CDP 连接
- ALWAYS 修改 DOM 轮询逻辑后运行 bun test 验证

---

## Compact Instructions

上下文压缩时保留：Build & Test 命令、源码结构、Safety Rails

---
*找不到某个决策？去 `docs/design-docs/` 找。还找不到，说明它没被记录——请创建它。*
