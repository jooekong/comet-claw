import { chromium } from "playwright-core";
import type { CometConnection, CometConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

let cachedConnection: CometConnection | null = null;

export async function connect(
  config: CometConfig = DEFAULT_CONFIG
): Promise<CometConnection> {
  if (cachedConnection) {
    try {
      await cachedConnection.page.evaluate(() => document.title);
      return cachedConnection;
    } catch {
      cachedConnection = null;
    }
  }

  const browser = await chromium.connectOverCDP(config.cdpEndpoint);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(
      "No browser context found. Is Comet running with an active session?"
    );
  }

  const pages = context.pages();
  const page =
    pages.find((p) => p.url().includes("perplexity.ai")) ??
    pages[0];

  if (!page) {
    throw new Error("No pages found in Comet browser.");
  }

  cachedConnection = { browser, context, page };
  return cachedConnection;
}

export async function disconnect(): Promise<void> {
  if (cachedConnection) {
    await cachedConnection.browser.close();
    cachedConnection = null;
  }
}

export async function healthCheck(
  config: CometConfig = DEFAULT_CONFIG
): Promise<{ connected: boolean; url?: string; error?: string }> {
  try {
    const response = await fetch(`${config.cdpEndpoint}/json`);
    const targets = (await response.json()) as Array<{
      url: string;
      type: string;
    }>;
    const pageTarget = targets.find((t) => t.type === "page");
    return { connected: true, url: pageTarget?.url };
  } catch (e) {
    return {
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
