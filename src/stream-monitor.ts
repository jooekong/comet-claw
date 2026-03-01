import type { CDPClient, StreamChunk, AgentAction, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export interface MonitorResult {
  chunks: StreamChunk[];
  actions: AgentAction[];
  fullText: string;
}

export interface StreamMonitorOpts {
  /** Called immediately for each answer_chunk and research_progress chunk received. */
  onChunk?: (chunk: StreamChunk) => void;
  /** When aborted, the monitor resolves immediately with whatever was collected. */
  signal?: AbortSignal;
}

export async function monitorStream(
  client: CDPClient,
  config: CometConfig = DEFAULT_CONFIG,
  opts?: StreamMonitorOpts
): Promise<MonitorResult> {
  const chunks: StreamChunk[] = [];
  const actions: AgentAction[] = [];
  let resolve: (result: MonitorResult) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<MonitorResult>((res) => {
    resolve = res;
  });

  const buildResult = (): MonitorResult => ({
    chunks,
    actions,
    fullText: chunks
      .filter((c) => c.type === "answer_chunk" && c.text)
      .map((c) => c.text)
      .join(""),
  });

  // cleanup is declared here so complete() can reference it via closure
  let cleanup: () => void;

  const complete = () => {
    clearTimeout(timeoutId);
    cleanup?.();
    resolve(buildResult());
  };

  timeoutId = setTimeout(complete, config.timeout);

  const ingestChunkPayload = (payload: string) => {
    for (const rawLine of payload.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const jsonText = line.startsWith("data:") ? line.slice(5).trim() : line;
      try {
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        const chunk = parseChunk(parsed);
        chunks.push(chunk);
        if (chunk.type === "answer_chunk" || chunk.type === "research_progress") {
          opts?.onChunk?.(chunk);
        }
        if (chunk.type === "task_complete") complete();
      } catch {
        // non-JSON line
      }
    }
  };

  const onEventSourceMessage = (params: {
    requestId: string;
    timestamp: number;
    eventName: string;
    eventId: string;
    data: string;
  }) => {
    if (!params.data) return;
    ingestChunkPayload(params.data);
  };

  const onWebSocketFrame = (params: {
    requestId: string;
    timestamp: number;
    response: { opcode: number; mask: boolean; payloadData: string };
  }) => {
    try {
      const msg = JSON.parse(params.response.payloadData) as Record<
        string,
        unknown
      >;
      const action = parseAction(msg);
      if (action) actions.push(action);
    } catch {
      // binary or non-JSON
    }
  };

  client.on("Network.eventSourceMessageReceived" as any, onEventSourceMessage);
  client.on("Network.webSocketFrameReceived" as any, onWebSocketFrame);

  cleanup = () => {
    try {
      (client as any).off?.("Network.eventSourceMessageReceived", onEventSourceMessage);
      (client as any).off?.("Network.webSocketFrameReceived", onWebSocketFrame);
      (client as any).removeListener?.("Network.eventSourceMessageReceived", onEventSourceMessage);
      (client as any).removeListener?.("Network.webSocketFrameReceived", onWebSocketFrame);
    } catch {
      // best-effort cleanup
    }
  };

  if (opts?.signal) {
    if (opts.signal.aborted) {
      complete();
    } else {
      opts.signal.addEventListener("abort", complete, { once: true });
    }
  }

  return promise;
}

export function parseChunk(data: Record<string, unknown>): StreamChunk {
  const type = data.type as string | undefined;

  if (type === "answer_chunk") {
    return { type: "answer_chunk", text: data.text as string, raw: data };
  }
  if (type === "task_complete") {
    return { type: "task_complete", raw: data };
  }
  if (type === "research_progress") {
    return {
      type: "research_progress",
      step: data.step as number,
      totalSteps: data.total_steps as number,
      raw: data,
    };
  }
  return { type: "unknown", raw: data };
}

export function parseAction(msg: Record<string, unknown>): AgentAction | null {
  const method = msg.method as string | undefined;
  if (!method) return null;

  const params = msg.params as Record<string, unknown> | undefined;
  return {
    method,
    action: params?.action as string | undefined,
    status: params?.status as string | undefined,
  };
}
