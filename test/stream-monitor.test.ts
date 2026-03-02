import { describe, test, expect, mock } from "bun:test";
import { parseChunk, parseAction, monitorStream } from "../src/stream-monitor.js";
import type { StreamChunk, CometConfig } from "../src/types.js";

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

const BASE_CONFIG: CometConfig = {
  cdpEndpoint: "http://127.0.0.1:9222",
  connectTimeoutMs: 30000,
  timeout: 50,
  sseRoutePatterns: ["**/api/answer**"],
};

describe("monitorStream", () => {
  function createMockMonitorClient() {
    let sseHandler: ((params: any) => void) | undefined;
    let wsHandler: ((params: any) => void) | undefined;
    const unsubscribeEventSource = mock(() => {});
    const unsubscribeWebSocket = mock(() => {});

    const client = {
      Network: {
        eventSourceMessageReceived: mock((handler: (params: any) => void) => {
          sseHandler = handler;
          return unsubscribeEventSource;
        }),
        webSocketFrameReceived: mock((handler: (params: any) => void) => {
          wsHandler = handler;
          return unsubscribeWebSocket;
        }),
      },
    } as any;

    return {
      client,
      emitSSE(params: any) {
        sseHandler?.(params);
      },
      emitWS(params: any) {
        wsHandler?.(params);
      },
      unsubscribeEventSource,
      unsubscribeWebSocket,
    };
  }

  test("resolves on timeout with empty result", async () => {
    const { client } = createMockMonitorClient();
    const result = await monitorStream(client, BASE_CONFIG);
    expect(result.chunks).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.fullText).toBe("");
  });

  test("calls onChunk for answer_chunk events", async () => {
    const received: StreamChunk[] = [];
    const { client, emitSSE } = createMockMonitorClient();

    const config = { ...BASE_CONFIG, timeout: 500 };
    const p = monitorStream(client, config, {
      onChunk: (chunk) => received.push(chunk),
    });

    // simulate SSE frames
    setTimeout(() => {
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "1",
        data: 'data: {"type":"answer_chunk","text":"Hello"}' });
    }, 10);
    setTimeout(() => {
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "2",
        data: 'data: {"type":"answer_chunk","text":" world"}' });
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "3",
        data: 'data: {"type":"task_complete"}' });
    }, 20);

    const result = await p;
    expect(received.length).toBe(2);
    expect(received[0].type).toBe("answer_chunk");
    expect((received[0] as any).text).toBe("Hello");
    expect((received[1] as any).text).toBe(" world");
    expect(result.fullText).toBe("Hello world");
  });

  test("calls onChunk for research_progress events", async () => {
    const received: StreamChunk[] = [];
    const { client, emitSSE } = createMockMonitorClient();

    const config = { ...BASE_CONFIG, timeout: 500 };
    const p = monitorStream(client, config, {
      onChunk: (chunk) => received.push(chunk),
    });

    setTimeout(() => {
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "1",
        data: 'data: {"type":"research_progress","step":2,"total_steps":10}' });
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "2",
        data: 'data: {"type":"task_complete"}' });
    }, 10);

    await p;
    expect(received.length).toBe(1);
    expect(received[0].type).toBe("research_progress");
    expect((received[0] as any).step).toBe(2);
  });

  test("signal already aborted resolves immediately", async () => {
    const ac = new AbortController();
    ac.abort();
    const { client } = createMockMonitorClient();
    const config = { ...BASE_CONFIG, timeout: 10_000 };

    const start = Date.now();
    const result = await monitorStream(client, config, { signal: ac.signal });
    expect(Date.now() - start).toBeLessThan(100);
    expect(result.chunks).toEqual([]);
  });

  test("signal abort after start resolves early", async () => {
    const ac = new AbortController();
    const { client } = createMockMonitorClient();
    const config = { ...BASE_CONFIG, timeout: 10_000 };

    const p = monitorStream(client, config, { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);

    const start = Date.now();
    const result = await p;
    expect(Date.now() - start).toBeLessThan(500);
    expect(result.fullText).toBe("");
  });

  test("task_complete event resolves without waiting for timeout", async () => {
    const { client, emitSSE } = createMockMonitorClient();

    const config = { ...BASE_CONFIG, timeout: 10_000 };
    const p = monitorStream(client, config);

    setTimeout(() => {
      emitSSE({ requestId: "r1", timestamp: 0, eventName: "message", eventId: "1",
        data: 'data: {"type":"task_complete"}' });
    }, 10);

    const start = Date.now();
    await p;
    expect(Date.now() - start).toBeLessThan(500);
  });
});
