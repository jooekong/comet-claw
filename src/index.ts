#!/usr/bin/env bun
import type { CLICommand, TaskMode } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { connect, disconnect, healthCheck } from "./cdp-client.js";
import { executeTask } from "./comet-skill.js";

function log(msg: string): void {
  process.stderr.write(`[comet-claw] ${msg}\n`);
}

function normalizeCommand(raw: string | undefined): string {
  return (raw ?? "").replace(/^-+/, "").toLowerCase();
}

export function parseArgs(args: string[]): CLICommand {
  const [rawName, ...rest] = args;
  const name = normalizeCommand(rawName);
  const query = rest.join(" ");

  switch (name) {
    case "search":
      return { name: "search", query };
    case "research":
      return { name: "research", query };
    case "agent":
      return { name: "agent", query };
    case "status":
      return { name: "status" };
    case "connect":
      return { name: "connect" };
    default:
      if (!rawName) {
        return { name: "search", query: "" };
      }
      return { name: "search", query: args.join(" ") };
  }
}

const MODE_MAP: Record<string, TaskMode> = {
  search: "search",
  research: "deep_research",
  agent: "agent_task",
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    log("Usage: comet-claw <command> [query]");
    log("Commands: search, research, agent, status, connect");
    log('Example: comet-claw search "AI trends 2026"');
    process.exit(0);
  }

  const cmd = parseArgs(args);

  if (cmd.name === "status") {
    const status = await healthCheck(DEFAULT_CONFIG);
    process.stdout.write(JSON.stringify(status, null, 2) + "\n");
    return;
  }

  if (cmd.name === "connect") {
    try {
      const conn = await connect(DEFAULT_CONFIG);
      const { result } = await conn.client.Runtime.evaluate({
        expression: "window.location.href",
        returnByValue: true,
      });
      process.stdout.write(
        JSON.stringify(
          {
            connected: true,
            targetId: conn.targetId,
            url: typeof result.value === "string" ? result.value : undefined,
          },
          null,
          2
        ) + "\n"
      );
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      log(`Error: ${error}`);
      process.stdout.write(JSON.stringify({ connected: false, error }) + "\n");
      process.exit(1);
    } finally {
      await disconnect();
    }
    return;
  }

  if (!cmd.query) {
    log("Error: query is required for search/research/agent commands");
    process.exit(1);
  }

  const mode = MODE_MAP[cmd.name] ?? "search";
  log(`Executing ${mode}: ${cmd.query}`);

  try {
    const result = await executeTask(cmd.query, mode, DEFAULT_CONFIG);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log(`Error: ${error}`);
    process.stdout.write(JSON.stringify({ error }) + "\n");
    process.exit(1);
  } finally {
    await disconnect();
  }
}

const isDirectRun =
  process.argv[1]?.endsWith("index.ts") ||
  process.argv[1]?.endsWith("comet-claw");

if (isDirectRun) {
  main();
}
