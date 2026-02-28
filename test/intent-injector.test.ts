import { describe, test, expect, mock } from "bun:test";
import {
  findInput,
  switchMode,
  fillInput,
  injectIntent,
  INPUT_SELECTORS,
  MODE_SELECTORS,
} from "../src/intent-injector.js";

function createMockPage(
  opts: {
    selectorsPresent?: string[];
    fillThrows?: boolean;
    typeThrows?: boolean;
  } = {}
) {
  const { selectorsPresent = [], fillThrows = false, typeThrows = false } = opts;
  const calls: string[] = [];

  const mockElement = {
    click: mock(async () => {
      calls.push("element.click");
    }),
  };

  const page = {
    $: mock(async (selector: string) => {
      calls.push(`$:${selector}`);
      return selectorsPresent.some((s) => selector.includes(s))
        ? mockElement
        : null;
    }),
    fill: mock(async (_sel: string, _text: string) => {
      calls.push(`fill:${_sel}`);
      if (fillThrows) throw new Error("fill failed");
    }),
    type: mock(async (_sel: string, _text: string) => {
      calls.push(`type:${_sel}`);
      if (typeThrows) throw new Error("type failed");
    }),
    click: mock(async (_sel: string) => {
      calls.push(`click:${_sel}`);
    }),
    press: mock(async (_sel: string, _key: string) => {
      calls.push(`press:${_sel}:${_key}`);
    }),
    evaluate: mock(async () => {
      calls.push("evaluate");
    }),
    waitForTimeout: mock(async () => {
      calls.push("waitForTimeout");
    }),
    keyboard: {
      press: mock(async (_key: string) => {
        calls.push(`keyboard.press:${_key}`);
      }),
    },
  };

  return { page: page as any, calls, mockElement };
}

describe("findInput", () => {
  test("returns first matching selector", async () => {
    const { page } = createMockPage({
      selectorsPresent: ["assistant-input"],
    });
    const result = await findInput(page);
    expect(result).toBe(INPUT_SELECTORS[0]);
  });

  test("falls through to last textarea if specific selectors not found", async () => {
    const { page } = createMockPage({ selectorsPresent: ["textarea"] });
    const result = await findInput(page);
    // "textarea" substring matches the placeholder selector first
    expect(result).toBe('textarea[placeholder*="Ask"]');
  });

  test("returns bare textarea when only exact match", async () => {
    const page = {
      $: mock(async (selector: string) => {
        if (selector === "textarea") return { click: async () => {} };
        return null;
      }),
    } as any;
    const result = await findInput(page);
    expect(result).toBe("textarea");
  });

  test("throws when no input found", async () => {
    const { page } = createMockPage({ selectorsPresent: [] });
    expect(findInput(page)).rejects.toThrow("Cannot find input element");
  });
});

describe("switchMode", () => {
  test("clicks mode toggle when element exists", async () => {
    const { page, calls } = createMockPage({
      selectorsPresent: ["deep-research"],
    });
    await switchMode(page, "deep_research");
    expect(calls).toContain("element.click");
    expect(calls).toContain("waitForTimeout");
  });

  test("does nothing when mode toggle not found", async () => {
    const { page, mockElement } = createMockPage({ selectorsPresent: [] });
    await switchMode(page, "deep_research");
    expect(mockElement.click).not.toHaveBeenCalled();
  });

  test("does nothing for agent_task mode (no selector defined)", async () => {
    const { page, mockElement } = createMockPage({ selectorsPresent: [] });
    await switchMode(page, "agent_task");
    expect(mockElement.click).not.toHaveBeenCalled();
  });
});

describe("fillInput", () => {
  test("uses page.fill as primary method", async () => {
    const { page, calls } = createMockPage({ selectorsPresent: [] });
    await fillInput(page, "textarea", "hello");
    expect(calls).toContain("fill:textarea");
    expect(calls).not.toContain("type:textarea");
  });

  test("falls back to type when fill throws", async () => {
    const { page, calls } = createMockPage({
      selectorsPresent: [],
      fillThrows: true,
    });
    await fillInput(page, "textarea", "hello");
    expect(calls).toContain("fill:textarea");
    expect(calls).toContain("click:textarea");
    expect(calls).toContain("keyboard.press:Meta+a");
    expect(calls).toContain("type:textarea");
  });

  test("falls back to evaluate when both fill and type throw", async () => {
    const { page, calls } = createMockPage({
      selectorsPresent: [],
      fillThrows: true,
      typeThrows: true,
    });
    await fillInput(page, "textarea", "hello");
    expect(calls).toContain("evaluate");
  });
});

describe("injectIntent", () => {
  test("skips mode switch for agent_task", async () => {
    const { page, calls } = createMockPage({
      selectorsPresent: ["assistant-input"],
    });
    await injectIntent(page, "test query", "agent_task");
    const modeSelCheck = calls.some(
      (c) => c.includes("deep-research") || c.includes("search-toggle")
    );
    expect(modeSelCheck).toBe(false);
    expect(calls).toContain("press:" + INPUT_SELECTORS[0] + ":Enter");
  });

  test("switches mode then fills and presses Enter for search", async () => {
    const { page, calls } = createMockPage({
      selectorsPresent: ["assistant-input", "search"],
    });
    await injectIntent(page, "test query", "search");
    expect(calls.some((c) => c.includes("fill:"))).toBe(true);
    expect(calls.some((c) => c.includes("press:") && c.includes("Enter"))).toBe(true);
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
