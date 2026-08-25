const pendingKey = "applitrail-pending-job-import";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SAVE_PENDING_IMPORT") {
    chrome.storage.session.set({ [pendingKey]: message.payload }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === "GET_PENDING_IMPORT") {
    chrome.storage.session.get(pendingKey).then((items) => sendResponse({ payload: items[pendingKey] || null }));
    return true;
  }
  if (message?.type === "CLEAR_PENDING_IMPORT") {
    chrome.storage.session.remove(pendingKey).then(() => sendResponse({ ok: true }));
    return true;
  }
  return undefined;
});
