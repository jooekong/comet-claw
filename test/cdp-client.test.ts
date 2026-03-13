import { describe, test, expect } from "bun:test";
import {
  findPerplexityTarget,
  findSidecarSearchTarget,
  findAnyPageTarget,
  parseTargets,
  normalizeLoopbackEndpoint,
  parseEndpoint,
  createCometClient,
} from "../src/cdp-client.js";
import type { CDPTarget } from "../src/types.js";
import type { CometConfig } from "../src/types.js";

function target(url: string, type = "page"): CDPTarget {
  return { id: url, type, title: "", url };
}

describe("findPerplexityTarget", () => {
  test("returns main perplexity page, not sidecar", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar/?copilot=true"),
      target("https://www.perplexity.ai/search?q=test"),
    ];
    expect(findPerplexityTarget(targets)?.url).toBe(
      "https://www.perplexity.ai/search?q=test"
    );
  });

  test("returns null when only sidecars exist", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar/?copilot=true"),
      target("https://github.com"),
    ];
    expect(findPerplexityTarget(targets)).toBeNull();
  });

  test("returns null when no perplexity pages", () => {
    expect(findPerplexityTarget([target("https://github.com")])).toBeNull();
  });
});

describe("findSidecarSearchTarget", () => {
  test("matches sidecar base URL", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar"),
    ];
    expect(findSidecarSearchTarget(targets)?.url).toBe(
      "https://www.perplexity.ai/sidecar"
    );
  });

  test("matches sidecar search URL", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar/search/abc123"),
    ];
    expect(findSidecarSearchTarget(targets)?.url).toBe(
      "https://www.perplexity.ai/sidecar/search/abc123"
    );
  });

  test("returns null when no sidecar", () => {
    const targets = [
      target("https://www.perplexity.ai/search?q=test"),
      target("https://github.com"),
    ];
    expect(findSidecarSearchTarget(targets)).toBeNull();
  });

  test("ignores non-page targets", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar", "iframe"),
    ];
    expect(findSidecarSearchTarget(targets)).toBeNull();
  });
});

describe("findAnyPageTarget", () => {
  test("prefers perplexity page", () => {
    const targets = [
      target("https://github.com"),
      target("https://www.perplexity.ai/search?q=test"),
    ];
    expect(findAnyPageTarget(targets).url).toBe(
      "https://www.perplexity.ai/search?q=test"
    );
  });

  test("falls back to non-chrome page", () => {
    const targets = [
      target("chrome://newtab/"),
      target("https://github.com"),
    ];
    expect(findAnyPageTarget(targets).url).toBe("https://github.com");
  });

  test("throws when no suitable page", () => {
    expect(() =>
      findAnyPageTarget([target("chrome://newtab/"), target("ws://blah", "worker")])
    ).toThrow("No suitable page");
  });

  test("skips sidecars in fallback", () => {
    const targets = [
      target("https://www.perplexity.ai/sidecar/?copilot=true"),
      target("https://github.com"),
    ];
    expect(findAnyPageTarget(targets).url).toBe("https://github.com");
  });
});

describe("parseTargets", () => {
  test("extracts page target url and title", () => {
    const targets = [
      { url: "devtools://devtools", title: "DevTools", type: "other" },
      { url: "https://www.perplexity.ai/", title: "Perplexity", type: "page" },
    ];
    expect(parseTargets(targets)).toEqual({
      url: "https://www.perplexity.ai/",
      title: "Perplexity",
    });
  });

  test("returns undefined fields when no page target", () => {
    expect(
      parseTargets([{ url: "devtools://d", title: "D", type: "other" }])
    ).toEqual({ url: undefined, title: undefined });
  });
});

describe("normalizeLoopbackEndpoint", () => {
  test("converts localhost to 127.0.0.1", () => {
    expect(normalizeLoopbackEndpoint("http://localhost:9333")).toBe(
      "http://127.0.0.1:9333"
    );
  });

  test("keeps 127.0.0.1 unchanged", () => {
    expect(normalizeLoopbackEndpoint("http://127.0.0.1:9333")).toBe(
      "http://127.0.0.1:9333"
    );
  });
});

describe("parseEndpoint", () => {
  test("extracts host and port", () => {
    expect(parseEndpoint("http://127.0.0.1:9333")).toEqual({
      host: "127.0.0.1",
      port: 9333,
    });
  });

  test("normalizes localhost", () => {
    expect(parseEndpoint("http://localhost:8888")).toEqual({
      host: "127.0.0.1",
      port: 8888,
    });
  });

  test("defaults port to 9333", () => {
    expect(parseEndpoint("http://127.0.0.1")).toEqual({
      host: "127.0.0.1",
      port: 9333,
    });
  });

  test("handles invalid URL", () => {
    expect(parseEndpoint("not-a-url")).toEqual({
      host: "127.0.0.1",
      port: 9333,
    });
  });
});

describe("CometClient.connect", () => {
  test("retries and fails after max attempts when target is unreachable", async () => {
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            id: "test-target",
            type: "page",
            title: "Perplexity",
            url: "https://www.perplexity.ai/",
          },
        ])
      ) as any;

    const config: CometConfig = {
      cdpEndpoint: "http://127.0.0.1:1",
      connectTimeoutMs: 50,
      timeout: 1000,
      sseRoutePatterns: ["**/api/answer**"],
    };
    const cometClient = createCometClient();

    try {
      await expect(cometClient.connect(config)).rejects.toThrow("Failed to connect after 3 attempts");
    } finally {
      globalThis.fetch = oldFetch;
    }
  }, 15_000);
});

describe("CometClient connection pool", () => {
  test("activeConnections starts empty", () => {
    const c = createCometClient();
    expect(c.activeConnections).toBe(0);
  });

  test("disconnectAll clears all cached connections", async () => {
    const c = createCometClient();
    expect(c.activeConnections).toBe(0);
    await c.disconnectAll();
    expect(c.activeConnections).toBe(0);
  });
});
