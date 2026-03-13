---
name: comet-perplexity
description: Delegate search and deep research tasks to Comet browser's native Perplexity AI
metadata: {"openclaw": {"requires": {"bins": ["comet-claw"]}, "emoji": "☄️", "homepage": "https://github.com/jooekong/comet-claw"}}
---

# Comet Perplexity Skill

Use the `comet-claw` CLI to delegate web search and deep research tasks to the Perplexity Comet browser. Comet must be running with CDP debugging enabled on port 9333 (configurable via `COMET_CDP_PORT` env var).

## When to Use

- User asks for **web search** with citations — use `search`
- User asks for **deep research** or comprehensive analysis — use `research`
- User asks to **browse a website**, extract data, or perform an agentic task — use `agent`

## Commands

### Quick Search (10-30 seconds)

```bash
comet-claw search "your search query"
```

Returns a JSON object with `answer`, `citations`, and `durationMs`.

### Deep Research (3-5 minutes)

```bash
comet-claw research "your research topic"
```

Returns a comprehensive research report with multiple sources and research steps.

### Agentic Task (varies)

```bash
comet-claw agent "go to github.com/trending and list top repos"
```

Delegates a general browsing task to Comet's agent.

### Check Connection

```bash
comet-claw status
```

Returns CDP connection health. Run this first if other commands fail.

## Output Format

All commands output JSON to stdout:

```json
{
  "answer": "...",
  "citations": [{"text": "...", "url": "..."}],
  "researchSteps": ["..."],
  "mode": "search",
  "durationMs": 15234
}
```

## Prerequisites

Comet must be launched with remote debugging:

```bash
/Applications/Comet.app/Contents/MacOS/Comet --remote-debugging-address=127.0.0.1 --remote-debugging-port=9333 --no-first-run
```

## Tips

- Prefer `search` for quick factual queries — it's much faster than `research`
- Use `research` when the user needs a thorough, multi-source analysis
- Always check `comet-claw status` if you get connection errors
- Parse the JSON output to extract the `answer` field for the user
