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
*找不到某个决策？去 `docs/design-docs/` 找。还找不到，说明它没被记录——请创建它。*
