import type { Page } from "playwright-core";
import type { TaskMode } from "./types.js";

const INPUT_SELECTORS = [
  '[data-testid="assistant-input"]',
  'textarea[placeholder*="Ask"]',
  "textarea",
];

const MODE_SELECTORS: Record<string, string> = {
  deep_research: '[data-mode="deep-research"], [data-testid="deep-research-toggle"]',
  search: '[data-mode="search"], [data-testid="search-toggle"]',
};

export async function injectIntent(
  page: Page,
  task: string,
  mode: TaskMode = "search"
): Promise<void> {
  if (mode !== "agent_task") {
    await switchMode(page, mode);
  }

  const inputSelector = await findInput(page);
  await fillInput(page, inputSelector, task);
  await page.press(inputSelector, "Enter");
}

async function switchMode(page: Page, mode: TaskMode): Promise<void> {
  const selector = MODE_SELECTORS[mode];
  if (!selector) return;

  const element = await page.$(selector);
  if (element) {
    await element.click();
    await page.waitForTimeout(300);
  }
}

async function findInput(page: Page): Promise<string> {
  for (const selector of INPUT_SELECTORS) {
    const el = await page.$(selector);
    if (el) return selector;
  }
  throw new Error(
    `Cannot find input element. Tried: ${INPUT_SELECTORS.join(", ")}`
  );
}

async function fillInput(
  page: Page,
  selector: string,
  text: string
): Promise<void> {
  try {
    await page.fill(selector, text);
    return;
  } catch {
    // fallback to type()
  }

  try {
    await page.click(selector);
    await page.keyboard.press("Meta+a");
    await page.type(selector, text, { delay: 10 });
    return;
  } catch {
    // fallback to React setter
  }

  await page.evaluate(
    ({ selector: sel, text: val }) => {
      const input = document.querySelector(sel) as HTMLTextAreaElement | null;
      if (!input) throw new Error(`Element not found: ${sel}`);
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, text }
  );
}
