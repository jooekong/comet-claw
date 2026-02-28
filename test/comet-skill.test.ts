import { describe, test, expect, mock } from "bun:test";
import { executeTask } from "../src/comet-skill.js";
import type { SkillDeps } from "../src/comet-skill.js";
import type { CometConfig } from "../src/types.js";

const testConfig: CometConfig = {
  cdpEndpoint: "http://localhost:9222",
  timeout: 100,
  sseRoutePatterns: ["**/api/answer**"],
};

function createMockDeps(overrides: Partial<SkillDeps> = {}): SkillDeps {
  const mockPage = {} as any;

  return {
    connect: mock(async () => ({ page: mockPage })),
    injectIntent: mock(async () => {}),
    monitorStream: mock(async () => ({
      chunks: [],
      actions: [],
      fullText: "",
    })),
    extractResult: mock(async (_page, mode, startTime) => ({
      answer: "DOM result",
      citations: [],
      researchSteps: [],
      mode,
      durationMs: Date.now() - startTime,
    })),
    ...overrides,
  };
}

describe("executeTask", () => {
  test("uses stream result when fullText is available", async () => {
    const deps = createMockDeps({
      monitorStream: mock(async () => ({
        chunks: [
          { type: "answer_chunk" as const, text: "Stream answer", raw: {} },
          { type: "task_complete" as const, raw: {} },
        ],
        actions: [],
        fullText: "Stream answer",
      })),
    });

    const result = await executeTask("test query", "search", testConfig, deps);

    expect(result.answer).toBe("Stream answer");
    expect(result.mode).toBe("search");
    expect(deps.extractResult).not.toHaveBeenCalled();
  });

  test("falls back to DOM extraction when stream has no text", async () => {
    const deps = createMockDeps();
    const result = await executeTask(
      "test query",
      "deep_research",
      testConfig,
      deps
    );

    expect(result.answer).toBe("DOM result");
    expect(result.mode).toBe("deep_research");
    expect(deps.extractResult).toHaveBeenCalled();
  });

  test("passes correct mode to injectIntent", async () => {
    const deps = createMockDeps();
    await executeTask("test query", "agent_task", testConfig, deps);

    expect(deps.injectIntent).toHaveBeenCalledWith(
      expect.anything(),
      "test query",
      "agent_task"
    );
  });

  test("calls connect with config", async () => {
    const deps = createMockDeps();
    await executeTask("q", "search", testConfig, deps);

    expect(deps.connect).toHaveBeenCalledWith(testConfig);
  });

  test("includes research steps from stream chunks", async () => {
    const deps = createMockDeps({
      monitorStream: mock(async () => ({
        chunks: [
          {
            type: "research_progress" as const,
            step: 1,
            totalSteps: 3,
            raw: {},
          },
          {
            type: "research_progress" as const,
            step: 2,
            totalSteps: 3,
            raw: {},
          },
          { type: "answer_chunk" as const, text: "Done", raw: {} },
          { type: "task_complete" as const, raw: {} },
        ],
        actions: [],
        fullText: "Done",
      })),
    });

    const result = await executeTask("q", "deep_research", testConfig, deps);

    expect(result.researchSteps).toEqual(["Step 1/3", "Step 2/3"]);
  });

  test("measures duration", async () => {
    const deps = createMockDeps({
      monitorStream: mock(async () => {
        await new Promise((r) => setTimeout(r, 30));
        return { chunks: [], actions: [], fullText: "fast" };
      }),
    });

    const result = await executeTask("q", "search", testConfig, deps);
    expect(result.durationMs).toBeGreaterThanOrEqual(20);
  });
});
