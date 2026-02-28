import CDP from "chrome-remote-interface";
import type { CDPClient, CometConnection, CometConfig, CDPTarget } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const PERPLEXITY_HOME = "https://www.perplexity.ai/";

let cachedConnection: CometConnection | null = null;

export function getCachedConnection(): CometConnection | null {
  return cachedConnection;
}

export function clearCachedConnection(): void {
  cachedConnection = null;
}

async function isConnectionAlive(conn: CometConnection): Promise<boolean> {
  try {
    const { result } = await conn.client.Runtime.evaluate({
      expression: "1+1",
      returnByValue: true,
    });
    return result.value === 2;
  } catch {
    return false;
  }
}

export async function listTargets(
  config: CometConfig = DEFAULT_CONFIG
): Promise<CDPTarget[]> {
  const { host, port } = parseEndpoint(config.cdpEndpoint);
  const response = await fetch(`http://${host}:${port}/json/list`);
  return (await response.json()) as CDPTarget[];
}

export function findPerplexityTarget(targets: CDPTarget[]): CDPTarget | null {
  return (
    targets.find(
      (t) =>
        t.type === "page" &&
        t.url.includes("perplexity.ai") &&
        !t.url.includes("sidecar")
    ) ?? null
  );
}

export function findAnyPageTarget(targets: CDPTarget[]): CDPTarget {
  const perp = findPerplexityTarget(targets);
  if (perp) return perp;

  const anyPage = targets.find(
    (t) =>
      t.type === "page" &&
      !t.url.startsWith("chrome://") &&
      !t.url.startsWith("chrome-extension://") &&
      !t.url.includes("sidecar")
  );
  if (anyPage) return anyPage;

  throw new Error("No suitable page target found in Comet browser.");
}

function isPerplexityUrl(url: string): boolean {
  return url.includes("perplexity.ai") && !url.includes("sidecar");
}

export async function connect(
  config: CometConfig = DEFAULT_CONFIG
): Promise<CometConnection> {
  if (cachedConnection && (await isConnectionAlive(cachedConnection))) {
    const { result } = await cachedConnection.client.Runtime.evaluate({
      expression: "window.location.href",
      returnByValue: true,
    });
    if (isPerplexityUrl(result.value as string)) {
      return cachedConnection;
    }
    await cachedConnection.client.close().catch(() => {});
    cachedConnection = null;
  }

  const targets = await listTargets(config);
  const perplexityTarget = findPerplexityTarget(targets);
  const target = perplexityTarget ?? findAnyPageTarget(targets);

  const client = await connectToTarget(config, target.id);

  const currentUrl = await getPageUrl(client);
  const isSearchReady =
    currentUrl === PERPLEXITY_HOME ||
    currentUrl.startsWith("https://www.perplexity.ai/search");
  if (!isSearchReady) {
    await navigateToPerplexity(client);
  }

  cachedConnection = { client, targetId: target.id };
  return cachedConnection;
}

async function getPageUrl(client: CDPClient): Promise<string> {
  try {
    const { result } = await client.Runtime.evaluate({
      expression: "window.location.href",
      returnByValue: true,
    });
    return result.value as string;
  } catch {
    return "";
  }
}

async function navigateToPerplexity(client: CDPClient): Promise<void> {
  await client.Page.navigate({ url: PERPLEXITY_HOME });
  await waitForInputReady(client, 20_000);
}

async function waitForInputReady(
  client: CDPClient,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { result } = await client.Runtime.evaluate({
        expression: `!!document.querySelector('[contenteditable="true"]') || !!document.querySelector('textarea')`,
        returnByValue: true,
      });
      if (result.value === true) return;
    } catch {
      // page still loading
    }
    await sleep(500);
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export function normalizeLoopbackEndpoint(endpoint: string): string {
  return endpoint.replace("://localhost", "://127.0.0.1");
}

export function parseEndpoint(endpoint: string): { host: string; port: number } {
  const normalized = normalizeLoopbackEndpoint(endpoint);
  try {
    const url = new URL(normalized);
    return { host: url.hostname, port: Number(url.port) || 9222 };
  } catch {
    return { host: "127.0.0.1", port: 9222 };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectToTarget(
  config: CometConfig,
  targetId: string
): Promise<CDPClient> {
  const { host, port } = parseEndpoint(config.cdpEndpoint);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const client = await CDP({ host, port, target: targetId });
      await Promise.all([
        client.Page.enable(),
        client.Runtime.enable(),
        client.DOM.enable(),
        client.Network.enable(),
      ]);
      return client;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
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
      await cachedConnection.client.close();
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
    const targets = await listTargets(config);
    const parsed = parseTargets(
      targets.map((t) => ({ url: t.url, title: t.title, type: t.type }))
    );
    return { connected: true, url: parsed.url, title: parsed.title };
  } catch (e) {
    return {
      connected: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function parseTargets(
  targets: Array<{ url: string; title?: string; type: string }>
): { url?: string; title?: string } {
  const pageTarget = targets.find((t) => t.type === "page");
  return { url: pageTarget?.url, title: pageTarget?.title };
}
