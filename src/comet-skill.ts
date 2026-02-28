import type { Page } from "playwright-core";
import type { TaskMode, TaskResult, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { connect } from "./cdp-client.js";
import { injectIntent } from "./intent-injector.js";
import { monitorStream } from "./stream-monitor.js";
import type { MonitorResult } from "./stream-monitor.js";
import { extractResult } from "./result-extractor.js";

export interface SkillDeps {
  connect: (config: CometConfig) => Promise<{ page: Page }>;
  injectIntent: (page: Page, task: string, mode: TaskMode) => Promise<void>;
  monitorStream: (page: Page, config: CometConfig) => Promise<MonitorResult>;
  extractResult: (
    page: Page,
    mode: TaskMode,
    startTime: number
  ) => Promise<TaskResult>;
}

const defaultDeps: SkillDeps = {
  connect,
  injectIntent,
  monitorStream,
  extractResult,
};

export async function executeTask(
  query: string,
  mode: TaskMode,
  config: CometConfig = DEFAULT_CONFIG,
  deps: SkillDeps = defaultDeps
): Promise<TaskResult> {
  const startTime = Date.now();
  const { page } = await deps.connect(config);

  const monitorPromise = deps.monitorStream(page, config);
  await deps.injectIntent(page, query, mode);
  const streamResult = await monitorPromise;

  if (streamResult.fullText) {
    return {
      answer: streamResult.fullText,
      citations: [],
      researchSteps: streamResult.chunks
        .filter((c) => c.type === "research_progress")
        .map((c) => `Step ${c.step}/${c.totalSteps}`),
      mode,
      durationMs: Date.now() - startTime,
    };
  }

  return deps.extractResult(page, mode, startTime);
}
