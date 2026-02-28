import { describe, test, expect, mock } from "bun:test";
import { parseChunk, parseAction, monitorStream } from "../src/stream-monitor.js";
import type { CometConfig } from "../src/types.js";

describe("parseChunk", () => {
  test("parses answer_chunk", () => {
    const chunk = parseChunk({ type: "answer_chunk", text: "Hello world" });
    expect(chunk.type).toBe("answer_chunk");
    expect(chunk.text).toBe("Hello world");
  });

  test("parses task_complete", () => {
    expect(parseChunk({ type: "task_complete" }).type).toBe("task_complete");
  });

  test("parses research_progress", () => {
    const chunk = parseChunk({ type: "research_progress", step: 3, total_steps: 10 });
    expect(chunk.type).toBe("research_progress");
    expect(chunk.step).toBe(3);
    expect(chunk.totalSteps).toBe(10);
  });

  test("returns unknown for unrecognized type", () => {
    expect(parseChunk({ type: "something_else" }).type).toBe("unknown");
  });

  test("returns unknown when type is missing", () => {
    expect(parseChunk({ data: "no type" }).type).toBe("unknown");
  });

  test("preserves raw data", () => {
    const input = { type: "answer_chunk", text: "hi", extra: 42 };
    expect(parseChunk(input).raw).toEqual(input);
  });
});

describe("parseAction", () => {
  test("parses action with params", () => {
    expect(
      parseAction({ method: "action_result", params: { action: "click", status: "success" } })
    ).toEqual({ method: "action_result", action: "click", status: "success" });
  });

  test("returns null when method is missing", () => {
    expect(parseAction({ params: { action: "click" } })).toBeNull();
  });

  test("handles missing params", () => {
    expect(parseAction({ method: "heartbeat" })).toEqual({
      method: "heartbeat", action: undefined, status: undefined,
    });
  });

  test("returns null for empty object", () => {
    expect(parseAction({})).toBeNull();
  });
});

describe("monitorStream", () => {
  test("resolves on timeout with empty result", async () => {
    const mockClient = {
      on: mock(() => {}),
      off: mock(() => {}),
    } as any;

    const config: CometConfig = {
      cdpEndpoint: "http://127.0.0.1:9222",
      connectTimeoutMs: 30000,
      timeout: 50,
      sseRoutePatterns: ["**/api/answer**"],
    };

    const result = await monitorStream(mockClient, config);
    expect(result.chunks).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.fullText).toBe("");
  });
});
