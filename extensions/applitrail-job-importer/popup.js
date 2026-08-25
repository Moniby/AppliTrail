const captureButton = document.querySelector("#capture");
const status = document.querySelector("#status");
const { extractJobPosting } = globalThis.AppliTrailJobExtractor;

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
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobPosting });
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
