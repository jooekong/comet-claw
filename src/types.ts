import type { Browser, BrowserContext, Page } from "playwright-core";

export type TaskMode = "search" | "deep_research" | "agent_task";

export interface CometConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
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
  timeout: number;
  sseRoutePatterns: string[];
}

export const DEFAULT_CONFIG: CometConfig = {
  cdpEndpoint: "http://localhost:9222",
  timeout: 120_000,
  sseRoutePatterns: ["**/rest/sse/**", "**/api/answer**"],
};

export interface CLICommand {
  name: "search" | "research" | "agent" | "status" | "connect";
  query?: string;
}
