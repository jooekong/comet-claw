import { describe, test, expect } from "bun:test";
import { findPerplexityPage, parseTargets } from "../src/cdp-client.js";

describe("findPerplexityPage", () => {
  const makePage = (url: string) =>
    ({ url: () => url }) as Parameters<typeof findPerplexityPage>[0][number];

  test("returns page with perplexity.ai in URL", () => {
    const pages = [
      makePage("https://example.com"),
      makePage("https://www.perplexity.ai/search"),
      makePage("https://google.com"),
    ];
    expect(findPerplexityPage(pages).url()).toBe(
      "https://www.perplexity.ai/search"
    );
  });

  test("falls back to first page when no perplexity match", () => {
    const pages = [
      makePage("https://example.com"),
      makePage("https://google.com"),
    ];
    expect(findPerplexityPage(pages).url()).toBe("https://example.com");
  });

  test("throws when page list is empty", () => {
    expect(() => findPerplexityPage([])).toThrow("No pages found");
  });
});

describe("parseTargets", () => {
  test("extracts page target url and title", () => {
    const targets = [
      { url: "devtools://devtools", title: "DevTools", type: "other" },
      {
        url: "https://www.perplexity.ai/",
        title: "Perplexity",
        type: "page",
      },
    ];
    expect(parseTargets(targets)).toEqual({
      url: "https://www.perplexity.ai/",
      title: "Perplexity",
    });
  });

  test("returns undefined fields when no page target", () => {
    const targets = [
      { url: "devtools://devtools", title: "DevTools", type: "other" },
    ];
    expect(parseTargets(targets)).toEqual({
      url: undefined,
      title: undefined,
    });
  });

  test("returns first page target when multiple exist", () => {
    const targets = [
      { url: "https://first.com", title: "First", type: "page" },
      { url: "https://second.com", title: "Second", type: "page" },
    ];
    expect(parseTargets(targets)).toEqual({
      url: "https://first.com",
      title: "First",
    });
  });
});
