# 开发指南

## 技术栈

- Runtime：Bun（包管理 + 测试），兼容 Node >= 22
- 浏览器自动化：`playwright-core`（仅 API，无 bundled browsers）
- TypeScript 严格模式
- CLI：轻量手写 parser（无外部依赖）

## 代码约定

- 变量和注释使用英文
- 保持简洁，避免过度抽象
- 优先使用函数式风格，避免不必要的 class
- JSON 输出到 stdout，日志输出到 stderr

## 项目结构

```
src/
├── index.ts              # CLI 入口
├── cdp-client.ts         # CDP 连接管理
├── intent-injector.ts    # 任务意图注入
├── stream-monitor.ts     # SSE/WebSocket 监控
├── result-extractor.ts   # 结果提取和结构化
├── comet-skill.ts        # 统一编排入口
└── types.ts              # 类型定义
skills/
└── comet-perplexity/
    └── SKILL.md          # OpenClaw Skill 定义
test/                     # 测试文件
docs/                     # 项目文档
```

## 测试

- 运行：`bun test`
- 文件放在 `test/` 目录
- 类型检查：`bun run typecheck`

## 外部参考

- [Perplexity Comet](https://www.perplexity.ai/comet/)
- [Playwright CDP](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)
- [OpenClaw Skills](https://docs.openclaw.ai/tools/skills)
- [Perplexity-Comet-MCP](https://github.com/RapierCraft/Perplexity-Comet-MCP) — 社区参考实现
