import type { CDPClient, TaskMode } from "./types.js";

export const INPUT_SELECTORS = [
  '[contenteditable="true"]',
  'textarea[placeholder*="Ask"]',
  "textarea",
];

export const MODE_SELECTORS: Record<string, string> = {
  deep_research:
    '[data-mode="deep-research"], [data-testid="deep-research-toggle"]',
  search: '[data-mode="search"], [data-testid="search-toggle"]',
};

export async function injectIntent(
  client: CDPClient,
  task: string,
  mode: TaskMode = "search"
): Promise<void> {
  await client.Page.bringToFront();
  await sleep(300);

  if (mode === "deep_research") {
    await switchMode(client, mode);
  }

  const inputSelector = await findInput(client);
  await fillInput(client, inputSelector, task);
  await sleep(300);
  await pressEnter(client);
}

const MODE_TEXT_MAP: Record<string, string[]> = {
  search: ["Search"],
  deep_research: ["Deep Research", "Research"],
};

export async function switchMode(
  client: CDPClient,
  mode: TaskMode
): Promise<void> {
  const selectorGroup = MODE_SELECTORS[mode];
  if (!selectorGroup) return;

  const selectors = selectorGroup.split(", ");
  for (const sel of selectors) {
    const { result } = await client.Runtime.evaluate({
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (el) { el.click(); return true; }
        return false;
      })()`,
      returnByValue: true,
    });
    if (result.value === true) {
      await sleep(300);
      return;
    }
  }

  const textLabels = MODE_TEXT_MAP[mode];
  if (!textLabels) return;
  await client.Runtime.evaluate({
    expression: `(() => {
      const labels = ${JSON.stringify(textLabels)};
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.innerText.trim();
        if (labels.includes(text) && btn.offsetParent !== null) {
          btn.click();
          return;
        }
      }
    })()`,
    awaitPromise: true,
  });
  await sleep(300);
}

export async function findInput(client: CDPClient): Promise<string> {
  for (const selector of INPUT_SELECTORS) {
    const { result } = await client.Runtime.evaluate({
      expression: `document.querySelector(${JSON.stringify(selector)}) !== null`,
      returnByValue: true,
    });
    if (result.value === true) return selector;
  }
  throw new Error(
    `Cannot find input element. Tried: ${INPUT_SELECTORS.join(", ")}`
  );
}

export async function fillInput(
  client: CDPClient,
  selector: string,
  text: string
): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("Element not found: " + ${JSON.stringify(selector)});
      el.focus();
      if (el.click) el.click();
      const dt = new DataTransfer();
      dt.setData("text/plain", ${JSON.stringify(text)});
      el.dispatchEvent(new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      }));
    })()`,
    awaitPromise: true,
  });
}

async function pressEnter(client: CDPClient): Promise<void> {
  await client.Runtime.evaluate({
    expression: `(() => {
      const el = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
      if (!el) return;
      el.focus();
      const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      el.dispatchEvent(new KeyboardEvent("keydown", opts));
      el.dispatchEvent(new KeyboardEvent("keyup", { ...opts, cancelable: false }));
    })()`,
    awaitPromise: true,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
