import type { CDPClient, TaskResult, TaskMode, Citation, CometConfig } from "./types.js";
import { connect } from "./cdp-client.js";
import { DEFAULT_CONFIG } from "./types.js";
import { POLL_SCRIPT } from "./poll-script.js";
import { sleep } from "./utils.js";

export interface PollStatus {
  status: "idle" | "working" | "completed";
  response: string;
  steps: string[];
  hasStopButton: boolean;
}

export const POLL_DEFAULTS = {
  intervalMs: 1500,
  maxIdlePolls: 5,
  warmUpMs: 8000,
};

export async function pollForResult(
  client: CDPClient,
  mode: TaskMode,
  startTime: number,
  timeoutMs: number,
  opts: {
    intervalMs?: number;
    maxIdlePolls?: number;
    warmUpMs?: number;
    reconnectConfig?: CometConfig;
    reconnect?: (config: CometConfig) => Promise<CDPClient | null>;
  } = {}
): Promise<TaskResult> {
  const intervalMs = opts.intervalMs ?? POLL_DEFAULTS.intervalMs;
  const maxIdlePolls = opts.maxIdlePolls ?? POLL_DEFAULTS.maxIdlePolls;
  const warmUpMs = opts.warmUpMs ?? POLL_DEFAULTS.warmUpMs;
  const reconnectConfig = opts.reconnectConfig ?? DEFAULT_CONFIG;
  const reconnect = opts.reconnect ?? tryReconnect;
  const deadline = startTime + timeoutMs;
  const warmUpDeadline = startTime + warmUpMs;
  let idleCount = 0;
  let sawWorking = false;

  let activeClient = client;
  let consecutiveFailures = 0;
  let reconnected = false;
  let pollCount = 0;
  // Keep Bun event loop alive during long polling loops.
  const keepalive = setInterval(() => {}, 5000);

  try {
    while (Date.now() < deadline) {
      const { poll: status } = await getStatus(activeClient);
      const pastWarmUp = Date.now() > warmUpDeadline;
      pollCount++;
      if (pollCount % 5 === 0) {
        process.stderr.write(`[comet-claw] poll #${pollCount}: status=${status.status}, response=${status.response.length > 0 ? status.response.substring(0, 40) + "..." : "(empty)"}, elapsed=${Date.now() - startTime}ms\n`);
      }

      if (status.status === "idle" && !status.response) {
        consecutiveFailures++;
        if (consecutiveFailures >= 5 && !reconnected) {
          reconnected = true;
        const newClient = await reconnect(reconnectConfig);
          if (newClient) activeClient = newClient;
        }
      } else {
        consecutiveFailures = 0;
      }

      if (status.status === "completed") {
        return {
          answer: status.response || "(Task completed, no response text extracted)",
          citations: await extractCitations(activeClient),
          researchSteps: status.steps,
          mode,
          durationMs: Date.now() - startTime,
        };
      }

      if (status.status === "working") {
        sawWorking = true;
        idleCount = 0;
      } else if (status.status === "idle") {
        if (pastWarmUp && sawWorking) {
          idleCount++;
          if (idleCount > maxIdlePolls) break;
        }
      }
      await sleep(intervalMs);
    }

    const { poll: finalStatus } = await getStatus(activeClient);
    return {
      answer: finalStatus.response || "(No response received)",
      citations: await extractCitations(activeClient),
      researchSteps: finalStatus.steps,
      mode,
      durationMs: Date.now() - startTime,
    };
  } finally {
    clearInterval(keepalive);
  }
}

async function getStatus(client: CDPClient): Promise<{ poll: PollStatus }> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: POLL_SCRIPT,
      returnByValue: true,
      awaitPromise: true,
    });
    return { poll: result.value as PollStatus };
  } catch {
    return { poll: { status: "idle", response: "", steps: [], hasStopButton: false } };
  }
}

async function tryReconnect(config: CometConfig): Promise<CDPClient | null> {
  try {
    const { client: newClient } = await connect(config);
    await newClient.Runtime.evaluate({ expression: "1", returnByValue: true });
    return newClient;
  } catch {
    return null;
  }
}

async function extractCitations(client: CDPClient): Promise<Citation[]> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const els = document.querySelectorAll("a[data-citation], a[href][class*='citation']");
        return Array.from(els).map(a => ({ text: a.innerText, url: a.href }));
      })()`,
      returnByValue: true,
    });
    return (result.value as Citation[]) || [];
  } catch {
    return [];
  }
}
