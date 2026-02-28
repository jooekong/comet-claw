import type { Page } from "playwright-core";
import type { TaskResult, TaskMode, Citation } from "./types.js";

export async function extractResult(
  page: Page,
  mode: TaskMode,
  startTime: number
): Promise<TaskResult> {
  const raw = await page.evaluate(() => {
    const answerEl = document.querySelector(".prose") as HTMLElement | null;
    const answer = answerEl?.innerText ?? "";

    const citationEls = document.querySelectorAll("a[data-citation]");
    const citations = Array.from(citationEls).map((a) => ({
      text: (a as HTMLAnchorElement).innerText,
      url: (a as HTMLAnchorElement).href,
    }));

    const stepEls = document.querySelectorAll(".research-step");
    const researchSteps = Array.from(stepEls).map(
      (s) => (s as HTMLElement).innerText
    );

    return { answer, citations, researchSteps };
  });

  return {
    answer: raw.answer,
    citations: raw.citations as Citation[],
    researchSteps: raw.researchSteps,
    mode,
    durationMs: Date.now() - startTime,
  };
}
