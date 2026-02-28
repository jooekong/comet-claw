import type CDP from "chrome-remote-interface";

export type CDPClient = CDP.Client;

export type TaskMode = "search" | "deep_research" | "agent_task";

export interface CometConnection {
  client: CDPClient;
  targetId: string;
}

export interface TaskResult {
  answer: string;
  citations: Citation[];
  researchSteps: string[];
  mode: TaskMode;
  durationMs: number;
}

export interface Citation {
  text: string;
  url: string;
}

export interface StreamChunk {
  type: "answer_chunk" | "task_complete" | "research_progress" | "unknown";
  text?: string;
  step?: number;
  totalSteps?: number;
  raw: unknown;
}

export interface AgentAction {
  method: string;
  action?: string;
  status?: string;
}

export interface CometConfig {
  cdpEndpoint: string;
  connectTimeoutMs: number;
  timeout: number;
  sseRoutePatterns: string[];
}

export const DEFAULT_CONFIG: CometConfig = {
  cdpEndpoint: "http://127.0.0.1:9222",
  connectTimeoutMs: 30_000,
  timeout: 60_000,
  sseRoutePatterns: ["**/rest/sse/**", "**/api/answer**"],
};

export const AGENT_TIMEOUT = 180_000;

export interface CDPTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface CLICommand {
  name: "search" | "research" | "agent" | "status" | "connect";
  query?: string;
}
