import { describe, test, expect, mock } from "bun:test";
import { extractResult } from "../src/result-extractor.js";

function createMockClient(domResult: {
  answer: string;
  citations: Array<{ text: string; url: string }>;
  researchSteps: string[];
}) {
  return {
    Runtime: {
      evaluate: mock(async () => ({ result: { value: domResult } })),
    },
  } as any;
}

describe("extractResult", () => {
  test("returns structured result from DOM data", async () => {
    const client = createMockClient({
      answer: "AI is evolving rapidly.",
      citations: [
        { text: "Source 1", url: "https://example.com/1" },
        { text: "Source 2", url: "https://example.com/2" },
      ],
      researchSteps: ["Step 1: Searching", "Step 2: Analyzing"],
    });

    const result = await extractResult(client, "search", Date.now() - 5000);
    expect(result.answer).toBe("AI is evolving rapidly.");
    expect(result.citations).toHaveLength(2);
    expect(result.citations[0].url).toBe("https://example.com/1");
    expect(result.researchSteps).toHaveLength(2);
    expect(result.mode).toBe("search");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("handles empty DOM result", async () => {
    const client = createMockClient({ answer: "", citations: [], researchSteps: [] });
    const result = await extractResult(client, "deep_research", Date.now());
    expect(result.answer).toBe("");
    expect(result.citations).toEqual([]);
  });

  test("calculates duration from startTime", async () => {
    const client = createMockClient({ answer: "test", citations: [], researchSteps: [] });
    const result = await extractResult(client, "agent_task", Date.now() - 3000);
    expect(result.durationMs).toBeGreaterThanOrEqual(2900);
    expect(result.durationMs).toBeLessThan(5000);
  });
});
