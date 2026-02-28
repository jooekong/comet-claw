import type { CDPClient, TaskResult, TaskMode, Citation } from "./types.js";

export async function extractResult(
  client: CDPClient,
  mode: TaskMode,
  startTime: number
): Promise<TaskResult> {
  const { result } = await client.Runtime.evaluate({
    expression: `(() => {
      const answerEl = document.querySelector(".prose");
      const answer = answerEl ? answerEl.innerText : "";

      const citationEls = document.querySelectorAll("a[data-citation]");
      const citations = Array.from(citationEls).map(a => ({
        text: a.innerText,
        url: a.href,
      }));

      const stepEls = document.querySelectorAll(".research-step");
      const researchSteps = Array.from(stepEls).map(s => s.innerText);

      return { answer, citations, researchSteps };
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });

  const raw = result.value as {
    answer: string;
    citations: Citation[];
    researchSteps: string[];
  };

  return {
    answer: raw.answer,
    citations: raw.citations,
    researchSteps: raw.researchSteps,
    mode,
    durationMs: Date.now() - startTime,
  };
}
