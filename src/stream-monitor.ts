import type { Page, Route, WebSocket } from "playwright-core";
import type { StreamChunk, AgentAction, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

export interface MonitorResult {
  chunks: StreamChunk[];
  actions: AgentAction[];
  fullText: string;
}

export async function monitorStream(
  page: Page,
  config: CometConfig = DEFAULT_CONFIG
): Promise<MonitorResult> {
  const chunks: StreamChunk[] = [];
  const actions: AgentAction[] = [];
  let resolve: (result: MonitorResult) => void;
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<MonitorResult>((res) => {
    resolve = res;
  });

  const complete = () => {
    clearTimeout(timeoutId);
    resolve({
      chunks,
      actions,
      fullText: chunks
        .filter((c) => c.type === "answer_chunk" && c.text)
        .map((c) => c.text)
        .join(""),
    });
  };

  timeoutId = setTimeout(complete, config.timeout);

  const handleSSERoute = async (route: Route) => {
    const response = await route.fetch();
    const body = await response.text();

    for (const line of body.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const data = JSON.parse(line.slice(5)) as Record<string, unknown>;
        const chunk = parseChunk(data);
        chunks.push(chunk);

        if (chunk.type === "task_complete") {
          complete();
        }
      } catch {
        // non-JSON SSE data, skip
      }
    }

    await route.fulfill({ response });
  };

  for (const pattern of config.sseRoutePatterns) {
    await page.route(pattern, handleSSERoute);
  }

  page.on("websocket", (ws: WebSocket) => {
    ws.on("framereceived", (data: { payload: string | Buffer }) => {
      try {
        const msg = JSON.parse(String(data.payload)) as Record<
          string,
          unknown
        >;
        const action = parseAction(msg);
        if (action) actions.push(action);
      } catch {
        // binary or non-JSON frame, skip
      }
    });
  });

  return promise;
}

function parseChunk(data: Record<string, unknown>): StreamChunk {
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

function parseAction(msg: Record<string, unknown>): AgentAction | null {
  const method = msg.method as string | undefined;
  if (!method) return null;

  const params = msg.params as Record<string, unknown> | undefined;
  return {
    method,
    action: params?.action as string | undefined,
    status: params?.status as string | undefined,
  };
}
