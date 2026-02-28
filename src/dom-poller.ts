import type { CDPClient, TaskResult, TaskMode, Citation, CometConfig } from "./types.js";
import { connect } from "./cdp-client.js";
import { DEFAULT_CONFIG } from "./types.js";

export interface PollStatus {
  status: "idle" | "working" | "completed";
  response: string;
  steps: string[];
  hasStopButton: boolean;
}

const POLL_SCRIPT = `(() => {
  const root = document.querySelector("main") || document.body;
  const body = root.innerText || "";

  let hasStopButton = false;
  for (const btn of document.querySelectorAll("button")) {
    const rect = btn.querySelector("rect");
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if ((rect || label.includes("stop")) && btn.offsetParent !== null && !btn.disabled) {
      hasStopButton = true;
      break;
    }
  }

  const hasSpinner = !!document.querySelector('[class*="animate-spin"], [class*="animate-pulse"]');
  const hasFollowUp = body.includes("Ask a follow-up") || body.includes("Ask follow-up");
  const hasProseContent = [...root.querySelectorAll('[class*="prose"], [class*="markdown"]')].some(
    el => el.innerText.trim().length > 0
  );

  const workingPatterns = [
    "Working", "Searching", "Reviewing sources", "Preparing to assist",
    "Clicking", "Typing:", "Navigating to", "Reading", "Analyzing",
  ];
  const isWorking = workingPatterns.some(p => body.includes(p));

  const hasStepsCompleted = /\\d+ steps? completed/i.test(body);
  const hasFinished = body.includes("Finished") && !hasStopButton;
  const hasReviewedSources = /Reviewed \\d+ sources?/i.test(body);

  let status = "idle";
  if (hasStopButton || hasSpinner) {
    status = "working";
  } else if (isWorking) {
    status = "working";
  } else if (hasStepsCompleted || hasFinished) {
    status = "completed";
  } else if (hasReviewedSources && hasProseContent && !isWorking) {
    status = "completed";
  } else if (hasFollowUp && hasProseContent && !hasStopButton) {
    status = "completed";
  } else if (hasProseContent && !hasStopButton && !isWorking) {
    status = "completed";
  }

  let response = "";
  if (status === "completed") {
    const mainEl = document.querySelector("main") || document.body;
    const allProse = mainEl.querySelectorAll('[class*="prose"], [class*="markdown"]');
    const texts = [];
    for (const el of allProse) {
      if (el.closest("nav, aside, header, footer, form")) continue;
      const text = el.innerText.trim();
      const isUI = ["Library", "Discover", "Spaces", "Finance", "Account",
        "Upgrade", "Home", "Search"].some(u => text.startsWith(u));
      if (isUI) continue;
      if (text.length > 5) texts.push(text);
    }
    if (texts.length > 0) {
      const uniqueTexts = [...new Set(texts)];
      const fullBlock = uniqueTexts.find(candidate =>
        uniqueTexts.every(item => item === candidate || candidate.includes(item))
      );
      response = fullBlock || uniqueTexts.join("\\n\\n");
    }
    response = response.replace(/View All|Show more|Ask a follow-up|Ask follow-up|\\d+ sources?/gi, "").trim();
    response = response
      .replace(/[ \\t]+\\n/g, "\\n")
      .replace(/\\n[ \\t]+/g, "\\n")
      .replace(/[ \\t]{2,}/g, " ")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  }

  const steps = [];
  const stepPatterns = [
    /Preparing to assist[^\\n]*/g, /Clicking[^\\n]*/g, /Typing:[^\\n]*/g,
    /Navigating[^\\n]*/g, /Reading[^\\n]*/g, /Searching[^\\n]*/g, /Found[^\\n]*/g,
  ];
  for (const pat of stepPatterns) {
    const matches = body.match(pat);
    if (matches) steps.push(...matches.map(s => s.trim().substring(0, 100)));
  }

  return {
    status,
    response: response.substring(0, 8000),
    steps: [...new Set(steps)].slice(-5),
    hasStopButton,
  };
})()`;

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
  let consecutiveFailures = 0;
  let reconnected = false;
  let pollCount = 0;
  const keepalive = setInterval(() => {}, 5000);

  try {
  while (Date.now() < deadline) {
    const { poll: status } = await getStatus(activeClient);
    const pastWarmUp = Date.now() > warmUpDeadline;
    pollCount++;
    if (pollCount % 5 === 0) {
      process.stderr.write(`[comet-claw] poll #${pollCount}: status=${status.status}, response=${status.response.length > 0 ? status.response.substring(0, 40) + '...' : '(empty)'}, elapsed=${Date.now() - startTime}ms\n`);
    }

    if (status.status === "idle" && !status.response) {
      consecutiveFailures++;
      if (consecutiveFailures >= 5 && !reconnected) {
        reconnected = true;
        const newClient = await tryReconnect(reconnectConfig);
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

async function getStatus(client: CDPClient): Promise<{ poll: PollStatus; reconnectedClient?: CDPClient }> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
