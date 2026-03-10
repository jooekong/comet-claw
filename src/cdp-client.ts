import CDP from "chrome-remote-interface";
import type { CDPClient, CometConnection, CometConfig, CDPTarget } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { sleep } from "./utils.js";

export class CometClient {
  private pool = new Map<string, CometConnection>();

  get activeConnections(): number {
    return this.pool.size;
  }

  getConnection(targetId: string): CometConnection | undefined {
    return this.pool.get(targetId);
  }

  async connect(config: CometConfig = DEFAULT_CONFIG): Promise<CometConnection> {
    for (const [id, conn] of this.pool) {
      if (await this.isConnectionAlive(conn)) {
        const currentUrl = await getPageUrl(conn.client);
        if (isPerplexityUrl(currentUrl)) return conn;
      }
      await conn.client.close().catch(() => {});
      this.pool.delete(id);
    }

    const targets = await listTargets(config);
    const perplexityTarget = findPerplexityTarget(targets);
    const target = perplexityTarget ?? findAnyPageTarget(targets);
    const client = await connectToTarget(config, target.id);

    const conn: CometConnection = { client, targetId: target.id };
    this.pool.set(target.id, conn);
    return conn;
  }

  async connectToTab(targetId: string, config: CometConfig = DEFAULT_CONFIG): Promise<CometConnection> {
    const existing = this.pool.get(targetId);
    if (existing && (await this.isConnectionAlive(existing))) {
      return existing;
    }

    const client = await connectToTarget(config, targetId);
    const conn: CometConnection = { client, targetId };
    this.pool.set(targetId, conn);
    return conn;
  }

  async disconnect(targetId?: string): Promise<void> {
    if (targetId) {
      const conn = this.pool.get(targetId);
      if (conn) {
        await conn.client.close().catch(() => {});
        this.pool.delete(targetId);
      }
      return;
    }

    const first = this.pool.values().next().value as CometConnection | undefined;
    if (first) {
      await first.client.close().catch(() => {});
      this.pool.delete(first.targetId);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const [id, conn] of this.pool) {
      await conn.client.close().catch(() => {});
      this.pool.delete(id);
    }
  }

  private async isConnectionAlive(conn: CometConnection): Promise<boolean> {
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
}

const defaultCometClient = new CometClient();

export function createCometClient(): CometClient {
  return new CometClient();
}

export function getCachedConnection(): CometConnection | undefined {
  const first = [...defaultCometClient["pool"].values()][0];
  return first;
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

/** Find the sidecar search tab where agent results live (e.g. /sidecar/search/...) */
export function findSidecarSearchTarget(targets: CDPTarget[]): CDPTarget | null {
  return (
    targets.find(
      (t) =>
        t.type === "page" &&
        t.url.includes("perplexity.ai/sidecar")
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
  return defaultCometClient.connect(config);
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

async function connectToTarget(
  config: CometConfig,
  targetId: string
): Promise<CDPClient> {
  const { host, port } = parseEndpoint(config.cdpEndpoint);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`CDP connection timed out after ${config.connectTimeoutMs}ms`)),
          config.connectTimeoutMs
        );
      });
      const client = await Promise.race([CDP({ host, port, target: targetId }), timeout]);
      if (timeoutId) clearTimeout(timeoutId);
      await Promise.all([
        client.Page.enable(),
        client.Runtime.enable(),
        client.DOM.enable(),
        client.Network.enable(),
      ]);
      return client;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
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
  await defaultCometClient.disconnect();
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
