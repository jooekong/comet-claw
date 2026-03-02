import { describe, test, expect, mock } from "bun:test";
import { pollForResult } from "../src/dom-poller.js";

const FAST = { intervalMs: 30, maxIdlePolls: 3, warmUpMs: 100 };

function createMockClient(statusSequence: Array<{ status: string; response: string }>) {
  let callIdx = 0;
  return {
    Runtime: {
      evaluate: mock(async (params: { expression: string }) => {
        if (params.expression.includes("citation")) {
          return { result: { value: [] } };
        }
        const s = statusSequence[Math.min(callIdx++, statusSequence.length - 1)];
        return {
          result: {
            value: {
              status: s.status,
              response: s.response,
              steps: [],
              hasStopButton: s.status === "working",
            },
          },
        };
      }),
    },
  } as any;
}

describe("pollForResult", () => {
  test("returns immediately when status is completed", async () => {
    const client = createMockClient([
      { status: "completed", response: "The answer is 2" },
    ]);
    const result = await pollForResult(client, "search", Date.now(), 5000, FAST);
    expect(result.answer).toBe("The answer is 2");
    expect(result.mode).toBe("search");
  });

  test("polls through working until completed", async () => {
    const client = createMockClient([
      { status: "working", response: "" },
      { status: "working", response: "" },
      { status: "completed", response: "Done" },
    ]);
    const result = await pollForResult(client, "deep_research", Date.now(), 5000, FAST);
    expect(result.answer).toBe("Done");
  });

  test("returns after timeout with whatever response exists", async () => {
    const client = createMockClient([
      { status: "working", response: "" },
    ]);
    const result = await pollForResult(client, "search", Date.now(), 100, FAST);
    expect(result.answer).toContain("No response");
  });

  test("only counts idle after warm-up and seeing working", async () => {
    const client = createMockClient([
      { status: "idle", response: "" },
      { status: "idle", response: "" },
      { status: "working", response: "" },
      { status: "idle", response: "" },
      { status: "idle", response: "" },
      { status: "idle", response: "" },
      { status: "idle", response: "" },
    ]);
    const start = Date.now();
    const result = await pollForResult(client, "search", start, 60000, {
      ...FAST,
      maxIdlePolls: 2,
    });
    expect(result.answer).toContain("No response");
  });

  test("detects agent completion via 'steps completed'", async () => {
    const client = createMockClient([
      { status: "working", response: "" },
      { status: "completed", response: "Found 3 replies on your v2ex post" },
    ]);
    const result = await pollForResult(client, "agent_task", Date.now(), 5000, FAST);
    expect(result.answer).toBe("Found 3 replies on your v2ex post");
    expect(result.mode).toBe("agent_task");
  });

  test("respects longer warmUpMs for agent tasks", async () => {
    const client = createMockClient([
      { status: "idle", response: "" },
      { status: "idle", response: "" },
      { status: "idle", response: "" },
      { status: "working", response: "" },
      { status: "completed", response: "Agent done" },
    ]);
    const result = await pollForResult(
      client, "agent_task", Date.now(), 60000,
      { intervalMs: 30, maxIdlePolls: 3, warmUpMs: 200 }
    );
    expect(result.answer).toBe("Agent done");
  });

  test("falls back to timeout result on persistent idle", async () => {
    const client = createMockClient([{ status: "idle", response: "" }]);

    const result = await pollForResult(client, "search", Date.now(), 120, {
      intervalMs: 10,
      maxIdlePolls: 3,
      warmUpMs: 0,
    });

    expect(result.answer).toContain("No response");
  });
});
