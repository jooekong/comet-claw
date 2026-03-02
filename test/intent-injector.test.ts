import { describe, test, expect, mock } from "bun:test";
import {
  findInput,
  switchMode,
  fillInput,
  injectIntent,
  INPUT_SELECTORS,
  MODE_SELECTORS,
} from "../src/intent-injector.js";

function createMockClient(opts: { selectorsPresent?: string[] } = {}) {
  const { selectorsPresent = [] } = opts;
  const calls: string[] = [];

  const client = {
    Runtime: {
      evaluate: mock(async (params: { expression: string }) => {
        calls.push("evaluate");
        const expr = params.expression;
        if (expr.includes("!== null")) {
          const match = selectorsPresent.some((s) => expr.includes(s));
          return { result: { value: match } };
        }
        if (expr.includes(".click()")) {
          const match = selectorsPresent.some((s) => expr.includes(s));
          return { result: { value: match } };
        }
        return { result: { value: undefined } };
      }),
    },
    Input: {
      dispatchKeyEvent: mock(async (params: { type: string; key?: string }) => {
        calls.push(`key:${params.type}:${params.key}`);
      }),
      insertText: mock(async () => {
        calls.push("insertText");
      }),
    },
  };

  return { client: client as any, calls };
}

describe("findInput", () => {
  test("returns first matching selector", async () => {
    const { client } = createMockClient({ selectorsPresent: ["contenteditable"] });
    const result = await findInput(client);
    expect(result).toBe(INPUT_SELECTORS[0]);
  });

  test("returns textarea when only that matches", async () => {
    const { client } = createMockClient({ selectorsPresent: ["textarea"] });
    const result = await findInput(client);
    expect(result).toContain("textarea");
  });

  test("falls back to auto-discovered input when known selectors miss", async () => {
    let callCount = 0;
    const client = {
      Runtime: {
        evaluate: mock(async (params: { expression: string }) => {
          callCount++;
          if (params.expression.includes("!== null")) {
            return { result: { value: false } };
          }
          if (params.expression.includes("discoverInput")) {
            return { result: { value: '[role="textbox"]' } };
          }
          return { result: { value: null } };
        }),
      },
    } as any;
    const result = await findInput(client);
    expect(result).toBe('[role="textbox"]');
  });

  test("throws when no input found and auto-discover fails", async () => {
    const client = {
      Runtime: {
        evaluate: mock(async (params: { expression: string }) => {
          if (params.expression.includes("!== null")) {
            return { result: { value: false } };
          }
          if (params.expression.includes("discoverInput")) {
            return { result: { value: null } };
          }
          return { result: { value: null } };
        }),
      },
    } as any;
    expect(findInput(client)).rejects.toThrow("Cannot find input element");
  });
});

describe("switchMode", () => {
  test("clicks mode toggle when element exists", async () => {
    const { client, calls } = createMockClient({ selectorsPresent: ["deep-research"] });
    await switchMode(client, "deep_research");
    expect(calls.filter((c) => c === "evaluate").length).toBeGreaterThanOrEqual(1);
  });

  test("does nothing for agent_task mode", async () => {
    const { client, calls } = createMockClient();
    await switchMode(client, "agent_task");
    expect(calls.length).toBe(0);
  });
});

describe("fillInput", () => {
  test("focuses element and inserts text via execCommand", async () => {
    const { client, calls } = createMockClient();
    await fillInput(client, '[contenteditable="true"]', "hello");
    expect(calls).toContain("evaluate");
  });
});

describe("injectIntent", () => {
  function createInjectMockClient(opts: { selectorsPresent?: string[] } = {}) {
    const { selectorsPresent = [] } = opts;
    const calls: string[] = [];
    const client = {
      Page: { bringToFront: mock(async () => { calls.push("bringToFront"); }) },
      Runtime: {
        evaluate: mock(async (params: { expression: string }) => {
          calls.push("evaluate");
          const expr = params.expression;
          if (expr.includes("!== null")) {
            const match = selectorsPresent.some((s) => expr.includes(s));
            return { result: { value: match } };
          }
          if (expr.includes(".click()")) {
            return { result: { value: true } };
          }
          if (expr.includes("Computer") && expr.includes("click")) {
            return { result: { value: true } };
          }
          if (expr.includes("contenteditable")) {
            return { result: { value: true } };
          }
          return { result: { value: undefined } };
        }),
      },
      Input: {
        dispatchKeyEvent: mock(async (params: { type: string; key?: string }) => {
          calls.push(`key:${params.type}:${params.key}`);
        }),
        insertText: mock(async () => { calls.push("insertText"); }),
      },
    };
    return { client: client as any, calls };
  }

  test("calls bringToFront and fills for search mode", async () => {
    const { client, calls } = createInjectMockClient({ selectorsPresent: ["contenteditable"] });
    await injectIntent(client, "test query", "search");
    expect(calls).toContain("bringToFront");
    expect(calls.filter(c => c === "evaluate").length).toBeGreaterThanOrEqual(3);
  });

  test("fills input for agent_task without mode switch", async () => {
    const { client, calls } = createInjectMockClient({ selectorsPresent: ["contenteditable"] });
    await injectIntent(client, "browse v2ex", "agent_task");
    expect(calls).toContain("bringToFront");
    expect(calls.filter(c => c === "evaluate").length).toBeGreaterThanOrEqual(3);
  });
});

describe("constants", () => {
  test("INPUT_SELECTORS has at least 3 entries", () => {
    expect(INPUT_SELECTORS.length).toBeGreaterThanOrEqual(3);
  });

  test("MODE_SELECTORS covers search and deep_research", () => {
    expect(MODE_SELECTORS).toHaveProperty("search");
    expect(MODE_SELECTORS).toHaveProperty("deep_research");
  });
});
