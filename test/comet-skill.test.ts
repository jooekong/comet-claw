import { describe, test, expect, mock, spyOn } from "bun:test";
import { executeTask, streamChunkToStderr } from "../src/comet-skill.js";
import type { SkillDeps } from "../src/comet-skill.js";
import type { CometConfig } from "../src/types.js";
import { AGENT_TIMEOUT } from "../src/types.js";
import { RequestQueue } from "../src/request-queue.js";

const testQueue = new RequestQueue({ cooldownMs: 0, maxSize: 100 });

const testConfig: CometConfig = {
  cdpEndpoint: "http://127.0.0.1:9333",
  connectTimeoutMs: 30000,
  timeout: 100,
  sseRoutePatterns: ["**/api/answer**"],
};

function createMockClient() {
  let evalCount = 0;
  return {
    Runtime: {
      evaluate: mock(async (params: { expression: string }) => {
        evalCount++;
        if (params.expression.includes("contenteditable") || params.expression.includes("textarea")) {
          return { result: { value: true } };
        }
        if (params.expression.includes("location.href")) {
          return { result: { value: evalCount <= 3
            ? "https://www.perplexity.ai/"
            : "https://www.perplexity.ai/search/new-query-abc" } };
        }
        if (params.expression.includes("animate-spin")) {
          return { result: { value: true } };
        }
        return { result: { value: "" } };
      }),
    },
    Page: {
      navigate: mock(async () => ({})),
      loadEventFired: mock(async () => ({})),
    },
    on: mock(() => {}),
    off: mock(() => {}),
  } as any;
}

function createMockDeps(overrides: Partial<SkillDeps> = {}): SkillDeps {
  const mockClient = createMockClient();
  return {
    connect: mock(async () => ({ client: mockClient })),
    injectIntent: mock(async () => {}),
    pollForResult: mock(async (_client, mode, startTime) => ({
      answer: "Polled result",
      citations: [],
      researchSteps: [],
      mode,
      durationMs: Date.now() - startTime,
    })),
    monitorStream: mock(async () => ({ chunks: [], actions: [], fullText: "" })),
    ...overrides,
  };
}

describe("streamChunkToStderr", () => {
  test("writes answer_chunk text to stderr", () => {
    const writes: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((s: any) => { writes.push(s); return true; });
    streamChunkToStderr({ type: "answer_chunk", text: "hello", raw: {} });
    expect(writes).toContain("hello");
    spy.mockRestore();
  });

  test("writes research_progress to stderr", () => {
    const writes: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((s: any) => { writes.push(s); return true; });
    streamChunkToStderr({ type: "research_progress", step: 3, totalSteps: 10, raw: {} });
    expect(writes.join("")).toContain("step 3/10");
    spy.mockRestore();
  });

  test("ignores unknown chunk types", () => {
    const writes: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((s: any) => { writes.push(s); return true; });
    streamChunkToStderr({ type: "unknown", raw: {} });
    expect(writes).toEqual([]);
    spy.mockRestore();
  });

  test("ignores answer_chunk without text", () => {
    const writes: string[] = [];
    const spy = spyOn(process.stderr, "write").mockImplementation((s: any) => { writes.push(s); return true; });
    streamChunkToStderr({ type: "answer_chunk", raw: {} });
    expect(writes).toEqual([]);
    spy.mockRestore();
  });
});

describe("executeTask", () => {
  test("returns polled result", async () => {
    const deps = createMockDeps();
    const result = await executeTask("test", "search", testConfig, deps, testQueue);
    expect(result.answer).toBe("Polled result");
    expect(result.mode).toBe("search");
  });

  test("passes correct mode to injectIntent", async () => {
    const deps = createMockDeps();
    await executeTask("q", "agent_task", testConfig, deps, testQueue);
    expect(deps.injectIntent).toHaveBeenCalledWith(expect.anything(), "q", "agent_task");
  });

  test("calls pollForResult after injectIntent", async () => {
    const callOrder: string[] = [];
    const deps = createMockDeps({
      injectIntent: mock(async () => { callOrder.push("inject"); }),
      pollForResult: mock(async (_c, mode, st) => {
        callOrder.push("poll");
        return { answer: "ok", citations: [], researchSteps: [], mode, durationMs: Date.now() - st };
      }),
    });
    await executeTask("q", "search", testConfig, deps, testQueue);
    expect(callOrder[0]).toBe("inject");
    expect(callOrder[1]).toBe("poll");
  });

  test("measures duration", async () => {
    const deps = createMockDeps({
      pollForResult: mock(async (_c, mode, st) => {
        await new Promise((r) => setTimeout(r, 30));
        return { answer: "ok", citations: [], researchSteps: [], mode, durationMs: Date.now() - st };
      }),
    });
    const result = await executeTask("q", "search", testConfig, deps, testQueue);
    expect(result.durationMs).toBeGreaterThanOrEqual(20);
  });

  test("uses AGENT_TIMEOUT for agent_task mode", async () => {
    let receivedTimeout = 0;
    const deps = createMockDeps({
      pollForResult: mock(async (_c, mode, st, timeoutMs) => {
        receivedTimeout = timeoutMs;
        return { answer: "ok", citations: [], researchSteps: [], mode, durationMs: Date.now() - st };
      }),
    });
    await executeTask("browse v2ex", "agent_task", testConfig, deps, testQueue);
    expect(receivedTimeout).toBe(AGENT_TIMEOUT);
  });

  test("uses config.timeout for search mode", async () => {
    let receivedTimeout = 0;
    const deps = createMockDeps({
      pollForResult: mock(async (_c, mode, st, timeoutMs) => {
        receivedTimeout = timeoutMs;
        return { answer: "ok", citations: [], researchSteps: [], mode, durationMs: Date.now() - st };
      }),
    });
    await executeTask("hello", "search", testConfig, deps, testQueue);
    expect(receivedTimeout).toBe(testConfig.timeout);
  });

  test("passes warmUpMs in pollOpts for agent_task", async () => {
    let receivedOpts: any = {};
    const deps = createMockDeps({
      pollForResult: mock(async (_c, mode, st, _t, opts) => {
        receivedOpts = opts;
        return { answer: "ok", citations: [], researchSteps: [], mode, durationMs: Date.now() - st };
      }),
    });
    await executeTask("browse", "agent_task", testConfig, deps, testQueue);
    expect(receivedOpts.warmUpMs).toBe(30_000);
  });

  test("throws when home page input is not ready within timeout", async () => {
    let now = 0;
    const nowSpy = spyOn(Date, "now").mockImplementation(() => {
      now += 11_000;
      return now;
    });
    const client = {
      Runtime: {
        evaluate: mock(async () => ({ result: { value: false } })),
      },
      Page: {
        navigate: mock(async () => ({})),
        loadEventFired: mock(async () => ({})),
      },
    } as any;
    const deps = createMockDeps({
      connect: mock(async () => ({ client })),
    });

    try {
      await expect(executeTask("q", "search", testConfig, deps, testQueue))
        .rejects.toThrow("Comet home page input was not ready/clean within timeout");
    } finally {
      nowSpy.mockRestore();
    }
  });
});
