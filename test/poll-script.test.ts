import { describe, test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import { POLL_SCRIPT } from "../src/poll-script.js";

function runPollScript(html: string) {
  const dom = new JSDOM(html, {
    url: "https://www.perplexity.ai/search?q=test",
    runScripts: "outside-only",
  });

  Object.defineProperty(dom.window.HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return this.textContent ?? "";
    },
    set(value: string) {
      this.textContent = value;
    },
  });

  return dom.window.eval(POLL_SCRIPT) as {
    status: string;
    response: string;
    steps: string[];
    hasStopButton: boolean;
  };
}

describe("POLL_SCRIPT", () => {
  test("extracts completed response from prose blocks", () => {
    const result = runPollScript(`
      <main>
        <div class="prose">Answer line 1.</div>
        <div class="prose">Answer line 2.</div>
        <div>Ask a follow-up</div>
      </main>
    `);

    expect(result.status).toBe("completed");
    expect(result.response).toContain("Answer line 1.");
    expect(result.response).toContain("Answer line 2.");
  });

  test("keeps working status when spinner exists", () => {
    const result = runPollScript(`
      <main>
        <div class="animate-spin">Loading...</div>
      </main>
    `);

    expect(result.status).toBe("working");
    expect(result.response).toBe("");
  });

  test("captures research steps from page text", () => {
    const result = runPollScript(`
      <main>
        <div>Preparing to assist with your request</div>
        <div>Searching across sources</div>
        <div>Reading the top result</div>
      </main>
    `);

    expect(result.steps.some((s) => s.includes("Preparing to assist"))).toBe(true);
    expect(result.steps.some((s) => s.includes("Searching"))).toBe(true);
    expect(result.steps.some((s) => s.includes("Reading"))).toBe(true);
  });
});
