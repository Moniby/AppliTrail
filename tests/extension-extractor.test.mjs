import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

function element(text = "", selectors = {}, selectorLists = {}) {
  return {
    innerText: text,
    textContent: text,
    getAttribute() { return null; },
    querySelector(selector) { return selectors[selector] || null; },
    querySelectorAll(selector) { return selectorLists[selector] || []; },
  };
}

function page(selectors = {}, selectorLists = {}) {
  return {
    querySelector(selector) { return selectors[selector] || null; },
    querySelectorAll(selector) { return selectorLists[selector] || []; },
  };
}

async function extractorFor(document, href) {
  const source = await readFile(new URL("../extensions/applitrail-job-importer/extract-job-posting.js", import.meta.url), "utf8");
  const context = { document, window: { location: new URL(href) }, URL, Date };
  vm.runInNewContext(source, context);
  return context.AppliTrailJobExtractor.extractJobPosting();
}

test("extracts the selected LinkedIn job instead of the search-results page", async () => {
  const topCard = element("Desktop Support Analyst - Ottawa Magnet Forensics Ottawa, ON On-site Full-time", {
    ".job-details-jobs-unified-top-card__job-title h1": element("Desktop Support Analyst - Ottawa"),
    ".job-details-jobs-unified-top-card__company-name a": element("Magnet Forensics"),
    ".job-details-jobs-unified-top-card__primary-description-container": element("Ottawa, ON · 2 weeks ago · Over 100 people clicked apply"),
  }, {
    ".job-details-jobs-unified-top-card__job-insight": [element("On-site"), element("Full-time")],
  });
  const document = page({
    ".job-details-jobs-unified-top-card": topCard,
    "#job-details": element("About the job\nWho We Are; What We Do; Where We’re Going\nRole Summary\nThe Desktop Support Analyst provides day-to-day support."),
    "h1": element("Desktop Support Analyst - Ottawa | Magnet Forensics | LinkedIn"),
  }, {
    'script[type="application/ld+json"]': [],
  });

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/search-results/?currentJobId=4450622327&keywords=full-time%20Support%20Engineer%20remote");
  assert.equal(result.company, "Magnet Forensics");
  assert.equal(result.role, "Desktop Support Analyst - Ottawa");
  assert.equal(result.location, "Ottawa, ON");
  assert.equal(result.positionType, "Full-time");
  assert.equal(result.locationType, "Onsite");
  assert.match(result.description, /^Who We Are; What We Do/);
  assert.match(result.description, /Role Summary/);
  assert.doesNotMatch(result.description, /About the job/i);
  assert.doesNotMatch(result.description, /Easy Apply|search results/i);
  assert.equal(result.url, "https://www.linkedin.com/jobs/view/4450622327");
});

test("keeps structured JobPosting extraction as the generic fallback", async () => {
  const jsonLd = element(JSON.stringify({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Technical Support Specialist",
    description: "Support customers and troubleshoot cloud services.",
    hiringOrganization: { name: "Example Cloud" },
    employmentType: "CONTRACTOR",
    jobLocation: { address: { addressLocality: "Toronto", addressRegion: "ON", addressCountry: "CA" } },
  }));
  const document = page({}, { 'script[type="application/ld+json"]': [jsonLd] });
  const result = await extractorFor(document, "https://jobs.example.com/support-specialist");
  assert.equal(result.company, "Example Cloud");
  assert.equal(result.role, "Technical Support Specialist");
  assert.equal(result.positionType, "Contract");
  assert.equal(result.location, "Toronto, ON, CA");
  assert.match(result.description, /troubleshoot cloud services/);
});

test("loads the dedicated extractor in extension version 1.1", async () => {
  const [popup, manifestText] = await Promise.all([
    readFile(new URL("../extensions/applitrail-job-importer/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../extensions/applitrail-job-importer/manifest.json", import.meta.url), "utf8"),
  ]);
  assert.ok(popup.indexOf('src="extract-job-posting.js"') < popup.indexOf('src="popup.js"'));
  assert.equal(JSON.parse(manifestText).version, "1.1.0");
});
