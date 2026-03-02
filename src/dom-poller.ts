import type { CDPClient, TaskResult, TaskMode, Citation, CometConfig } from "./types.js";
import { listTargets, findSidecarSearchTarget, createCometClient } from "./cdp-client.js";
import { DEFAULT_CONFIG } from "./types.js";
import { POLL_SCRIPT } from "./poll-script.js";
import { sleep } from "./utils.js";
import { logger } from "./logger.js";

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
  } = {}
): Promise<TaskResult> {
  const intervalMs = opts.intervalMs ?? POLL_DEFAULTS.intervalMs;
  const maxIdlePolls = opts.maxIdlePolls ?? POLL_DEFAULTS.maxIdlePolls;
  const warmUpMs = opts.warmUpMs ?? POLL_DEFAULTS.warmUpMs;
  const reconnectConfig = opts.reconnectConfig ?? DEFAULT_CONFIG;
  const deadline = startTime + timeoutMs;
  const warmUpDeadline = startTime + warmUpMs;
  let idleCount = 0;
  let sawWorking = false;

  let activeClient = client;
  let consecutiveTimeouts = 0;
  let switchedToSidecar = false;
  let pollCount = 0;
  // Keep Bun event loop alive during long polling loops.
  const keepalive = setInterval(() => {}, 5000);

  try {
    while (Date.now() < deadline) {
      const { poll: status, timedOut } = await getStatus(activeClient);
      const pastWarmUp = Date.now() > warmUpDeadline;
      pollCount++;

      // When evaluate times out, the agent has navigated to an external site.
      // The results live in a separate sidecar search tab — switch to it.
      if (timedOut) {
        consecutiveTimeouts++;
        logger.debug(`poll #${pollCount}: agent navigating externally (timeout #${consecutiveTimeouts}), elapsed=${Date.now() - startTime}ms`);
        if (!switchedToSidecar) {
          const sidecarClient = await findAndConnectSidecar(reconnectConfig);
          if (sidecarClient) {
            activeClient = sidecarClient;
            switchedToSidecar = true;
            logger.debug("switched to sidecar search tab for polling");
          }
        }
        sawWorking = true;
        idleCount = 0;
        await sleep(intervalMs);
        continue;
      }

      consecutiveTimeouts = 0;
      logger.debug(`poll #${pollCount}: status=${status.status}, hasStop=${status.hasStopButton}, resp=${status.response.length}chars, steps=[${status.steps.join("; ")}], elapsed=${Date.now() - startTime}ms`);

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

const POLL_TIMEOUT = 5_000;
const IDLE_POLL: PollStatus = { status: "idle", response: "", steps: [], hasStopButton: false };

async function getStatus(client: CDPClient): Promise<{ poll: PollStatus; timedOut: boolean }> {
  try {
    const evalPromise = client.Runtime.evaluate({
      expression: POLL_SCRIPT,
      returnByValue: true,
      awaitPromise: true,
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("poll evaluate timeout")), POLL_TIMEOUT)
    );
    const { result } = await Promise.race([evalPromise, timeout]);
    return { poll: result.value as PollStatus, timedOut: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut = msg.includes("timeout");
    if (!timedOut) logger.warn(`getStatus failed: ${msg}`);
    return { poll: IDLE_POLL, timedOut };
  }
}

async function findAndConnectSidecar(config: CometConfig): Promise<CDPClient | null> {
  try {
    const targets = await listTargets(config);
    const sidecar = findSidecarSearchTarget(targets);
    if (!sidecar) return null;
    const tempClient = createCometClient();
    const conn = await tempClient.connectToTab(sidecar.id, config);
    // Verify the connection works
    await conn.client.Runtime.evaluate({ expression: "1", returnByValue: true });
    logger.debug(`connected to sidecar tab: ${sidecar.url.substring(0, 80)}`);
    return conn.client;
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
