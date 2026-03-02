import type { CDPClient, TaskMode, TaskResult, CometConfig, StreamChunk } from "./types.js";
import { DEFAULT_CONFIG, AGENT_TIMEOUT } from "./types.js";
import { connect } from "./cdp-client.js";
import { injectIntent } from "./intent-injector.js";
import { pollForResult } from "./dom-poller.js";
import { monitorStream } from "./stream-monitor.js";
import type { MonitorResult, StreamMonitorOpts } from "./stream-monitor.js";
import { sleep } from "./utils.js";
import { RequestQueue } from "./request-queue.js";
import { logger } from "./logger.js";

const taskQueue = new RequestQueue();

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
  monitorStream?: (
    client: CDPClient,
    config: CometConfig,
    opts?: StreamMonitorOpts
  ) => Promise<MonitorResult>;
}

const defaultDeps: SkillDeps = {
  connect,
  injectIntent,
  pollForResult,
  monitorStream,
};

export async function executeTask(
  query: string,
  mode: TaskMode,
  config: CometConfig = DEFAULT_CONFIG,
  deps: SkillDeps = defaultDeps,
  queue: RequestQueue = taskQueue
): Promise<TaskResult> {
  return queue.enqueue(() => runTask(query, mode, config, deps));
}

async function runTask(
  query: string,
  mode: TaskMode,
  config: CometConfig,
  deps: SkillDeps
): Promise<TaskResult> {
  const startTime = Date.now();
  const { client } = await deps.connect(config);

  await ensureCleanHomePage(client);

  const urlBefore = await getPageUrl(client);
  await deps.injectIntent(client, query, mode);
  await waitForPageTransition(client, urlBefore);

  const ac = new AbortController();
  const monitorFn = deps.monitorStream ?? monitorStream;
  void monitorFn(client, config, {
    signal: ac.signal,
    onChunk: streamChunkToStderr,
  });

  const timeoutMs = mode === "agent_task" ? Math.max(config.timeout, AGENT_TIMEOUT) : config.timeout;
  const pollOpts: PollOpts =
    mode === "agent_task"
      ? { warmUpMs: 30_000, reconnectConfig: config }
      : { reconnectConfig: config };
  const result = await deps.pollForResult(client, mode, startTime, timeoutMs, pollOpts);
  ac.abort();
  return result;
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

  logger.warn("page transition timeout after submit; continue polling on current page");
}

export function streamChunkToStderr(chunk: StreamChunk): void {
  if (chunk.type === "answer_chunk" && chunk.text) {
    process.stderr.write(chunk.text);
  } else if (chunk.type === "research_progress" && chunk.step !== undefined) {
    process.stderr.write(
      `\n[comet-claw] research step ${chunk.step}/${chunk.totalSteps ?? "?"}\n`
    );
  }
}
