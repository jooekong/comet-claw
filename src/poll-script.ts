export const POLL_SCRIPT = `(() => {
  const cached = window.__cometRoot;
  const root = (cached && document.contains(cached))
    ? cached
    : (window.__cometRoot = document.querySelector("main") || document.body);
  const body = root.innerText || "";

  let hasStopButton = false;
  for (const btn of root.querySelectorAll("button")) {
    const rect = btn.querySelector("rect");
    const label = (btn.getAttribute("aria-label") || "").toLowerCase();
    if ((rect || label.includes("stop")) && btn.offsetParent !== null && !btn.disabled) {
      hasStopButton = true;
      break;
    }
  }

  const hasSpinner = !!document.querySelector('[class*="animate-spin"], [class*="animate-pulse"]');
  const hasFollowUp = body.includes("Ask a follow-up") || body.includes("Ask follow-up");
  const hasProseContent = [...root.querySelectorAll('[class*="prose"], [class*="markdown"]')].some(
    el => el.innerText.trim().length > 0
  );

  const workingPatterns = [
    "Working", "Searching", "Reviewing sources", "Preparing to assist",
    "Clicking", "Typing:", "Navigating to", "Reading", "Analyzing",
  ];
  const isWorking = workingPatterns.some(p => body.includes(p));

  const hasStepsCompleted = /\\d+ steps? completed/i.test(body);
  const hasFinished = body.includes("Finished") && !hasStopButton;
  const hasReviewedSources = /Reviewed \\d+ sources?/i.test(body);

  let status = "idle";
  if (hasStopButton || hasSpinner) {
    status = "working";
  } else if (isWorking) {
    status = "working";
  } else if (hasStepsCompleted || hasFinished) {
    status = "completed";
  } else if (hasReviewedSources && hasProseContent && !isWorking) {
    status = "completed";
  } else if (hasFollowUp && hasProseContent && !hasStopButton) {
    status = "completed";
  } else if (hasProseContent && !hasStopButton && !isWorking) {
    status = "completed";
  }

  let response = "";
  if (status === "completed") {
    const mainEl = document.querySelector("main") || document.body;
    const allProse = mainEl.querySelectorAll('[class*="prose"], [class*="markdown"]');
    const texts = [];
    for (const el of allProse) {
      if (el.closest("nav, aside, header, footer, form")) continue;
      const text = el.innerText.trim();
      const isUI = ["Library", "Discover", "Spaces", "Finance", "Account",
        "Upgrade", "Home", "Search"].some(u => text.startsWith(u));
      if (isUI) continue;
      if (text.length > 5) texts.push(text);
    }
    if (texts.length > 0) {
      const uniqueTexts = [...new Set(texts)];
      const fullBlock = uniqueTexts.find(candidate =>
        uniqueTexts.every(item => item === candidate || candidate.includes(item))
      );
      response = fullBlock || uniqueTexts.join("\\n\\n");
    }
    response = response.replace(/View All|Show more|Ask a follow-up|Ask follow-up|\\d+ sources?/gi, "").trim();
    response = response
      .replace(/[ \\t]+\\n/g, "\\n")
      .replace(/\\n[ \\t]+/g, "\\n")
      .replace(/[ \\t]{2,}/g, " ")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  }

  const steps = [];
  const stepPatterns = [
    /Preparing to assist[^\\n]*/g, /Clicking[^\\n]*/g, /Typing:[^\\n]*/g,
    /Navigating[^\\n]*/g, /Reading[^\\n]*/g, /Searching[^\\n]*/g, /Found[^\\n]*/g,
  ];
  for (const pat of stepPatterns) {
    const matches = body.match(pat);
    if (matches) steps.push(...matches.map(s => s.trim().substring(0, 100)));
  }

  return {
    status,
    response: response.substring(0, 8000),
    steps: [...new Set(steps)].slice(-5),
    hasStopButton,
  };
})()`;
