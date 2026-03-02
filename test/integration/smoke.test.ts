/**
 * Integration smoke test — requires a running Comet browser with CDP on :9222.
 *
 * Run manually: bun run test:integration
 * Skipped in CI / regular `bun test`.
 */
import { describe, test, expect } from "bun:test";
import { healthCheck, listTargets } from "../../src/cdp-client.js";
import { executeTask } from "../../src/comet-skill.js";
import { RequestQueue } from "../../src/request-queue.js";

const COMET_AVAILABLE = await (async () => {
  try {
    const status = await healthCheck();
    return status.connected;
  } catch {
    return false;
  }
})();

describe.skipIf(!COMET_AVAILABLE)("integration: smoke", () => {
  test("healthCheck returns connected=true with perplexity URL", async () => {
    const status = await healthCheck();
    expect(status.connected).toBe(true);
    expect(status.url).toContain("perplexity.ai");
  });

  test("listTargets returns at least one page target", async () => {
    const targets = await listTargets();
    const pages = targets.filter((t) => t.type === "page");
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  test("executeTask search returns a non-empty answer", async () => {
    const queue = new RequestQueue({ cooldownMs: 0 });
    const result = await executeTask(
      "What is 2+2?",
      "search",
      undefined,
      undefined,
      queue
    );
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.mode).toBe("search");
    expect(result.durationMs).toBeGreaterThan(0);
  }, 120_000);
});
