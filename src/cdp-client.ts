import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import type { CometConnection, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

let cachedConnection: CometConnection | null = null;

export function getCachedConnection(): CometConnection | null {
  return cachedConnection;
}

export function clearCachedConnection(): void {
  cachedConnection = null;
}

async function isConnectionAlive(conn: CometConnection): Promise<boolean> {
  try {
    await conn.page.evaluate(() => document.title);
    return true;
  } catch {
    return false;
  }
}

export function findPerplexityPage(pages: Page[]): Page {
  const match = pages.find((p) => p.url().includes("perplexity.ai"));
  if (match) return match;
  if (pages.length > 0) return pages[0];
  throw new Error("No pages found in Comet browser.");
}

export async function connect(
  config: CometConfig = DEFAULT_CONFIG
): Promise<CometConnection> {
  if (cachedConnection && (await isConnectionAlive(cachedConnection))) {
    return cachedConnection;
  }
  cachedConnection = null;

  const browser = await connectWithRetry(config);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(
      "No browser context found. Is Comet running with an active session?"
    );
  }

  const page = findPerplexityPage(context.pages());
  cachedConnection = { browser, context, page };
  return cachedConnection;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

async function connectWithRetry(config: CometConfig): Promise<Browser> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await chromium.connectOverCDP(config.cdpEndpoint);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw new Error(
    `Failed to connect after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

export async function disconnect(): Promise<void> {
  if (cachedConnection) {
    try {
      await cachedConnection.browser.close();
    } catch {
      // already closed
    }
    cachedConnection = null;
  }
}

export interface HealthStatus {
  connected: boolean;
  url?: string;
  title?: string;
  error?: string;
}

export async function healthCheck(
  config: CometConfig = DEFAULT_CONFIG
): Promise<HealthStatus> {
  try {
    const response = await fetch(`${config.cdpEndpoint}/json`);
    const targets = (await response.json()) as Array<{
      url: string;
      title: string;
      type: string;
    }>;
    const pageTarget = targets.find((t) => t.type === "page");
    return {
      connected: true,
      url: pageTarget?.url,
      title: pageTarget?.title,
    };
  } catch (e) {
    return {
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function parseTargets(
  targets: Array<{ url: string; title: string; type: string }>
): { url?: string; title?: string } {
  const pageTarget = targets.find((t) => t.type === "page");
  return { url: pageTarget?.url, title: pageTarget?.title };
}
