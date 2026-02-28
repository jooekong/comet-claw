import { describe, test, expect, mock } from "bun:test";
import { extractResult } from "../src/result-extractor.js";

function createMockPage(domResult: {
  answer: string;
  citations: Array<{ text: string; url: string }>;
  researchSteps: string[];
}) {
  return {
    evaluate: mock(async () => domResult),
  } as any;
}

describe("extractResult", () => {
  test("returns structured result from DOM data", async () => {
    const page = createMockPage({
      answer: "AI is evolving rapidly.",
      citations: [
        { text: "Source 1", url: "https://example.com/1" },
        { text: "Source 2", url: "https://example.com/2" },
      ],
      researchSteps: ["Step 1: Searching", "Step 2: Analyzing"],
    });

    const result = await extractResult(page, "search", Date.now() - 5000);

    expect(result.answer).toBe("AI is evolving rapidly.");
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].url).toBe("https://example.com/1");
    expect(result.researchSteps).toHaveLength(2);
    expect(result.mode).toBe("search");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("handles empty DOM result", async () => {
    const page = createMockPage({
      answer: "",
      citations: [],
      researchSteps: [],
    });

    const result = await extractResult(page, "deep_research", Date.now());

    expect(result.answer).toBe("");
    expect(result.citations).toEqual([]);
    expect(result.researchSteps).toEqual([]);
    expect(result.mode).toBe("deep_research");
  });

  test("calculates duration from startTime", async () => {
    const page = createMockPage({
      answer: "test",
      citations: [],
      researchSteps: [],
    });

    const startTime = Date.now() - 3000;
    const result = await extractResult(page, "agent_task", startTime);

    expect(result.durationMs).toBeGreaterThanOrEqual(2900);
    expect(result.durationMs).toBeLessThan(5000);
  });

  test("preserves all citation fields", async () => {
    const page = createMockPage({
      answer: "test",
      citations: [
        { text: "Wikipedia", url: "https://en.wikipedia.org/wiki/AI" },
      ],
      researchSteps: [],
    });

    const result = await extractResult(page, "search", Date.now());

    expect(result.citations[0]).toEqual({
      text: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/AI",
    });
  });
});
