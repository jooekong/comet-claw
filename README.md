# Comet-Claw

OpenClaw Skill that delegates search and deep research tasks to [Perplexity Comet](https://www.perplexity.ai/comet/) browser via Chrome DevTools Protocol (CDP).

## What It Does

Comet-Claw bridges OpenClaw with Comet's native Agentic Browsing capabilities through an "intent injection + state monitoring" architecture:

- **Search** — fast web search with citations (10-30s)
- **Deep Research** — multi-step research reports (3-5min)
- **Agent Task** — general agentic browsing (navigate, extract, compare)

Instead of reimplementing browser automation, it lets Comet's AI handle the "how" while OpenClaw handles the "what".

## Prerequisites

- [Perplexity Comet Browser](https://www.perplexity.ai/comet/) installed
- Perplexity Pro or Max subscription (for Deep Research)
- Active login session in Comet
- [Bun](https://bun.sh/)（当前 CLI 为 Bun-only，`bin` 直接指向 TypeScript 源码）

## Install

```bash
# Clone and install
git clone https://github.com/jooekong/comet-claw.git
cd comet-claw
bun install

# Link CLI globally
bun link
```

## Setup

1. Launch Comet with CDP debugging enabled:

```bash
# macOS
/Applications/Comet.app/Contents/MacOS/Comet \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  --no-first-run

# Windows
"%LOCALAPPDATA%\Perplexity\Comet\Application\comet.exe" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333
```

You can override the port via the `COMET_CDP_PORT` environment variable.

2. Verify the CDP endpoint:

```bash
curl http://localhost:9333/json
```

## Usage

```bash
comet-claw search "2026年AI发展趋势"
comet-claw research "量子计算在药物研发中的应用"
comet-claw agent "去GitHub trending看看今天热门项目"
comet-claw status    # check Comet CDP connection
```

Output is JSON to stdout for easy parsing by OpenClaw agent.

## OpenClaw Skill

Copy the skill to your OpenClaw workspace:

```bash
cp -r skills/comet-perplexity ~/.openclaw/workspace/skills/
```

The agent will automatically detect and use the skill for search/research tasks.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Development

```bash
bun run dev          # watch mode
bun test             # run tests
bun run typecheck    # type check
```

## License

MIT
