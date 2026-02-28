import { describe, test, expect } from "bun:test";
import {
  findPerplexityTarget,
  findAnyPageTarget,
  parseTargets,
  normalizeLoopbackEndpoint,
  parseEndpoint,
} from "../src/cdp-client.js";
import type { CDPTarget } from "../src/types.js";

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
    expect(normalizeLoopbackEndpoint("http://localhost:9222")).toBe(
      "http://127.0.0.1:9222"
    );
  });

  test("keeps 127.0.0.1 unchanged", () => {
    expect(normalizeLoopbackEndpoint("http://127.0.0.1:9222")).toBe(
      "http://127.0.0.1:9222"
    );
  });
});

describe("parseEndpoint", () => {
  test("extracts host and port", () => {
    expect(parseEndpoint("http://127.0.0.1:9222")).toEqual({
      host: "127.0.0.1",
      port: 9222,
    });
  });

  test("normalizes localhost", () => {
    expect(parseEndpoint("http://localhost:8888")).toEqual({
      host: "127.0.0.1",
      port: 8888,
    });
  });

  test("defaults port to 9222", () => {
    expect(parseEndpoint("http://127.0.0.1")).toEqual({
      host: "127.0.0.1",
      port: 9222,
    });
  });

  test("handles invalid URL", () => {
    expect(parseEndpoint("not-a-url")).toEqual({
      host: "127.0.0.1",
      port: 9222,
    });
  });
});
