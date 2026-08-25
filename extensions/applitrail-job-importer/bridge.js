let delivered = false;
let attempts = 0;

function deliverPendingImport() {
  chrome.runtime.sendMessage({ type: "GET_PENDING_IMPORT" }, (response) => {
    const payload = response?.payload;
    if (payload && !delivered) {
      window.postMessage({ source: "applitrail-job-importer", type: "APPLITRAIL_JOB_IMPORT", payload }, window.location.origin);
    }
    attempts += 1;
    if (!delivered && attempts < 20) setTimeout(deliverPendingImport, 400);
  });
}

setTimeout(deliverPendingImport, 400);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  if (event.data?.source === "applitrail-app" && event.data?.type === "APPLITRAIL_JOB_IMPORT_ACK") {
    delivered = true;
    chrome.runtime.sendMessage({ type: "CLEAR_PENDING_IMPORT" });
  }
});
