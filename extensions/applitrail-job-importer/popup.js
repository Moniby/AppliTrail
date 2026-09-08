const captureButton = document.querySelector("#capture");
const status = document.querySelector("#status");
const { extractJobPosting } = globalThis.AppliTrailJobExtractor;

function mergeFrameResults(results, pageUrl) {
  const candidates = results
    .map((entry) => entry?.result)
    .filter(Boolean)
    .sort((left, right) => {
      const score = (item) => (item.description?.length || 0)
        + (item.role ? 1200 : 0)
        + (item.company ? 900 : 0)
        + [item.location, item.positionType, item.locationType, item.salary].filter(Boolean).length * 250;
      return score(right) - score(left);
    });
  if (!candidates.length) return null;
  const merged = { ...candidates[0] };
  for (const candidate of candidates.slice(1)) {
    for (const field of ["company", "role", "location", "positionType", "locationType", "salary", "description"]) {
      if (!merged[field] && candidate[field]) merged[field] = candidate[field];
    }
  }
  merged.url = pageUrl;
  return merged;
}

function setStatus(message, disabled = false) {
  status.textContent = message;
  captureButton.disabled = disabled;
}

captureButton.addEventListener("click", async () => {
  setStatus("Reading this job posting…", true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
      throw new Error("Open a job posting in a regular browser tab first.");
    }
    let frameResults;
    try {
      frameResults = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: extractJobPosting });
    } catch {
      frameResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobPosting });
    }
    const result = mergeFrameResults(frameResults, tab.url);
    if (!result?.description && !result?.role && !result?.company) {
      throw new Error("AppliTrail could not find a job posting on this page. You can still add it manually.");
    }
    await chrome.runtime.sendMessage({ type: "SAVE_PENDING_IMPORT", payload: result });
    await chrome.tabs.create({ url: "https://applitrail.com/app?extension_import=1" });
    setStatus("Opening AppliTrail for your review.");
    window.close();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "AppliTrail could not capture this posting.");
    captureButton.disabled = false;
  }
});
