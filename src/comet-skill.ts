import type { CDPClient, TaskMode, TaskResult, CometConfig } from "./types.js";
import { DEFAULT_CONFIG, AGENT_TIMEOUT } from "./types.js";
import { connect } from "./cdp-client.js";
import { injectIntent } from "./intent-injector.js";
import { pollForResult } from "./dom-poller.js";

export interface PollOpts {
  intervalMs?: number;
  maxIdlePolls?: number;
  warmUpMs?: number;
  reconnectConfig?: CometConfig;
}

export interface SkillDeps {
  connect: (config: CometConfig) => Promise<{ client: CDPClient }>;
  injectIntent: (client: CDPClient, task: string, mode: TaskMode) => Promise<void>;
  pollForResult: (
    client: CDPClient,
    mode: TaskMode,
    startTime: number,
    timeoutMs: number,
    opts?: PollOpts
  ) => Promise<TaskResult>;
}

const defaultDeps: SkillDeps = {
  connect,
  injectIntent,
  pollForResult,
};

export async function executeTask(
  query: string,
  mode: TaskMode,
  config: CometConfig = DEFAULT_CONFIG,
  deps: SkillDeps = defaultDeps
): Promise<TaskResult> {
  const startTime = Date.now();
  const { client } = await deps.connect(config);

  await ensureCleanHomePage(client);

  const urlBefore = await getPageUrl(client);
  await deps.injectIntent(client, query, mode);
  await waitForPageTransition(client, urlBefore);

  const timeoutMs = mode === "agent_task" ? Math.max(config.timeout, AGENT_TIMEOUT) : config.timeout;
  const pollOpts: PollOpts =
    mode === "agent_task"
      ? { warmUpMs: 30_000, reconnectConfig: config }
      : { reconnectConfig: config };
  return deps.pollForResult(client, mode, startTime, timeoutMs, pollOpts);
}

async function getPageUrl(client: CDPClient): Promise<string> {
  const { result } = await client.Runtime.evaluate({
    expression: "window.location.href",
    returnByValue: true,
  });
  return result.value as string;
}

async function ensureCleanHomePage(client: CDPClient): Promise<void> {
  await client.Page.navigate({ url: "https://www.perplexity.ai/" });
  try {
    await Promise.race([
      client.Page.loadEventFired(),
      sleep(5000),
    ]);
  } catch { /* timeout ok */ }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const { result } = await client.Runtime.evaluate({
        expression: `(() => {
          const el = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
          if (!el) return false;
          const text = el.innerText || el.value || '';
          return text.trim() === '' || text.trim() === 'Ask anything...';
        })()`,
        returnByValue: true,
      });
      if (result.value === true) return;
    } catch { /* page loading */ }
    await sleep(500);
  }
  throw new Error("Comet home page input was not ready/clean within timeout");
}

async function waitForPageTransition(
  client: CDPClient,
  previousUrl: string,
  timeoutMs = 10_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = await getPageUrl(client);
    if (url !== previousUrl) return;

    const { result } = await client.Runtime.evaluate({
      expression: `!!document.querySelector('[class*="animate-spin"], [class*="animate-pulse"]')`,
      returnByValue: true,
    });
    if (result.value === true) return;

    await sleep(300);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
