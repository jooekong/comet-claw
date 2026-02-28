import type { TaskMode, TaskResult, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { connect } from "./cdp-client.js";
import { injectIntent } from "./intent-injector.js";
import { monitorStream } from "./stream-monitor.js";
import { extractResult } from "./result-extractor.js";

export async function executeTask(
  query: string,
  mode: TaskMode,
  config: CometConfig = DEFAULT_CONFIG
): Promise<TaskResult> {
  const startTime = Date.now();
  const { page } = await connect(config);

  const monitorPromise = monitorStream(page, config);
  await injectIntent(page, query, mode);
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

  return extractResult(page, mode, startTime);
}
