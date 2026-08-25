const captureButton = document.querySelector("#capture");
const status = document.querySelector("#status");

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

function extractJobPosting() {
  const tidy = (value, maximum = 40000) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
  const pick = (...selectors) => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = tidy(node?.getAttribute("content") || node?.textContent || "", 1000);
      if (value) return value;
    }
    return "";
  };
  const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((node) => { try { const parsed = JSON.parse(node.textContent || "null"); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return []; } })
    .flatMap((entry) => entry?.["@graph"] ? entry["@graph"] : [entry])
    .find((entry) => entry && (entry["@type"] === "JobPosting" || (Array.isArray(entry["@type"]) && entry["@type"].includes("JobPosting"))));
  const description = tidy(jsonLd?.description || pick('[data-testid*="description"]','[class*="job-description"]','[id*="job-description"]','main article','main'), 40000);
  const title = tidy(jsonLd?.title || pick('h1','meta[property="og:title"]','title'), 300);
  const organization = jsonLd?.hiringOrganization;
  const company = tidy(typeof organization === "object" ? organization?.name : organization || pick('[data-testid*="company"]','[class*="company"]','[class*="employer"]'), 300);
  const locationValue = jsonLd?.jobLocation;
  const jobLocation = tidy(typeof locationValue === "object" ? [locationValue?.address?.addressLocality,locationValue?.address?.addressRegion,locationValue?.address?.addressCountry].filter(Boolean).join(", ") : locationValue || pick('[data-testid*="location"]','[class*="location"]'), 500);
  const employment = tidy(jsonLd?.employmentType || "", 80).toLowerCase();
  const positionType = employment.includes("contract") ? "Contract" : employment.includes("part") ? "Part-time" : employment.includes("intern") ? "Internship" : employment.includes("volunteer") ? "Volunteer" : employment ? "Full-time" : "";
  const combined = `${title} ${description}`.toLowerCase();
  const locationType = /\bremote\b/.test(combined) ? "Remote" : /\bhybrid\b/.test(combined) ? "Hybrid" : /\bon[ -]?site\b/.test(combined) ? "Onsite" : "";
  const salary = tidy(jsonLd?.baseSalary?.value?.value || jsonLd?.baseSalary?.value || "", 200);
  return { company, role: title, location: jobLocation, positionType, locationType, salary, description, url: window.location.href, capturedAt: new Date().toISOString() };
}
