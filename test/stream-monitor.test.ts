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
    const chunk = parseChunk({ type: "task_complete" });
    expect(chunk.type).toBe("task_complete");
  });

  test("parses research_progress", () => {
    const chunk = parseChunk({
      type: "research_progress",
      step: 3,
      total_steps: 10,
    });
    expect(chunk.type).toBe("research_progress");
    expect(chunk.step).toBe(3);
    expect(chunk.totalSteps).toBe(10);
  });

  test("returns unknown for unrecognized type", () => {
    const chunk = parseChunk({ type: "something_else", foo: "bar" });
    expect(chunk.type).toBe("unknown");
    expect(chunk.raw).toEqual({ type: "something_else", foo: "bar" });
  });

  test("returns unknown when type is missing", () => {
    const chunk = parseChunk({ data: "no type here" });
    expect(chunk.type).toBe("unknown");
  });

  test("preserves raw data", () => {
    const input = { type: "answer_chunk", text: "hi", extra: 42 };
    const chunk = parseChunk(input);
    expect(chunk.raw).toEqual(input);
  });
});

describe("parseAction", () => {
  test("parses action_result with params", () => {
    const action = parseAction({
      method: "action_result",
      params: { action: "click", status: "success" },
    });
    expect(action).toEqual({
      method: "action_result",
      action: "click",
      status: "success",
    });
  });

  test("returns null when method is missing", () => {
    expect(parseAction({ params: { action: "click" } })).toBeNull();
  });

  test("handles missing params", () => {
    const action = parseAction({ method: "heartbeat" });
    expect(action).toEqual({
      method: "heartbeat",
      action: undefined,
      status: undefined,
    });
  });

  test("returns null for empty object", () => {
    expect(parseAction({})).toBeNull();
  });
});

describe("monitorStream", () => {
  test("resolves on timeout with collected chunks", async () => {
    const routeHandlers: Array<(route: any) => Promise<void>> = [];
    const wsListeners: Array<(ws: any) => void> = [];

    const mockPage = {
      route: mock(async (_pattern: string, handler: any) => {
        routeHandlers.push(handler);
      }),
      on: mock((_event: string, handler: any) => {
        wsListeners.push(handler);
      }),
    } as any;

    const config: CometConfig = {
      cdpEndpoint: "http://localhost:9222",
      timeout: 50,
      sseRoutePatterns: ["**/api/answer**"],
    };

    const result = await monitorStream(mockPage, config);

    expect(result.chunks).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.fullText).toBe("");
  });

  test("collects chunks from SSE route handler", async () => {
    let routeHandler: ((route: any) => Promise<void>) | null = null;

    const mockPage = {
      route: mock(async (_pattern: string, handler: any) => {
        routeHandler = handler;
      }),
      on: mock(() => {}),
    } as any;

    const config: CometConfig = {
      cdpEndpoint: "http://localhost:9222",
      timeout: 200,
      sseRoutePatterns: ["**/api/answer**"],
    };

    const resultPromise = monitorStream(mockPage, config);

    // Simulate SSE data arriving via route handler
    if (routeHandler) {
      const mockRoute = {
        fetch: mock(async () => ({
          text: async () =>
            'data:{"type":"answer_chunk","text":"Hello "}\ndata:{"type":"answer_chunk","text":"world"}\ndata:{"type":"task_complete"}',
        })),
        fulfill: mock(async () => {}),
      };
      await (routeHandler as any)(mockRoute);
    }

    const result = await resultPromise;
    expect(result.fullText).toBe("Hello world");
    expect(result.chunks.length).toBe(3);
    expect(result.chunks[2].type).toBe("task_complete");
  });
});
