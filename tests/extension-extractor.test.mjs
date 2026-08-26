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

test("finds About the job semantically when LinkedIn class selectors change", async () => {
  const header = element("Desktop Support Analyst - Ottawa | Magnet Forensics\nMagnet Forensics\nOttawa, ON · 2 weeks ago\nOn-site\nFull-time");
  const title = element("Desktop Support Analyst - Ottawa | Magnet Forensics");
  title.parentElement = header;
  const aboutHeading = element("About the job");
  aboutHeading.nextElementSibling = element("Who We Are; What We Do; Where We’re Going\n\nMagnet Forensics is a global leader in digital investigative software.\n\nRole Summary\nThe Desktop Support Analyst provides day-to-day support to employees.");
  const document = page({
    'h1[class*="job-title"]': title,
    'a[href*="/company/"]': element("Magnet Forensics"),
  }, {
    'script[type="application/ld+json"]': [],
    'h1,h2,h3,h4,[role="heading"]': [title, aboutHeading],
  });
  document.body = element("Search results\nAbout the job\nFallback body copy that should not be needed.");

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/search-results/?currentJobId=4450622327");
  assert.equal(result.company, "Magnet Forensics");
  assert.equal(result.role, "Desktop Support Analyst - Ottawa");
  assert.equal(result.location, "Ottawa, ON");
  assert.equal(result.positionType, "Full-time");
  assert.equal(result.locationType, "Onsite");
  assert.match(result.description, /^Who We Are; What We Do/);
  assert.match(result.description, /Role Summary/);
});

test("captures salary and employment details from the selected LinkedIn job card", async () => {
  const topCard = element("OpenAI\nAI Support Engineer - Toronto\nCanada · 1 week ago · Over 100 people clicked apply\n261K CAD/yr - 290K CAD/yr\nRemote\nFull-time", {
    ".job-details-jobs-unified-top-card__job-title h1": element("AI Support Engineer - Toronto"),
    ".job-details-jobs-unified-top-card__company-name a": element("OpenAI"),
    ".job-details-jobs-unified-top-card__primary-description-container": element("Canada · 1 week ago · Over 100 people clicked apply"),
  }, {
    ".job-details-jobs-unified-top-card__job-insight": [element("261K CAD/yr - 290K CAD/yr")],
  });
  const document = page({
    ".job-details-jobs-unified-top-card": topCard,
    "#job-details": element("About the job\nSupport customers using OpenAI products and resolve technical issues."),
  }, {
    'script[type="application/ld+json"]': [],
  });

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/view/1234567890");
  assert.equal(result.company, "OpenAI");
  assert.equal(result.role, "AI Support Engineer - Toronto");
  assert.equal(result.location, "Canada");
  assert.equal(result.salary, "261K CAD/yr - 290K CAD/yr");
  assert.equal(result.locationType, "Remote");
  assert.equal(result.positionType, "Full-time");
});

test("captures dollar salary and hybrid type from a LinkedIn job card", async () => {
  const topCard = element("LTM\nMS 365 Support Engineer\nBellevue, WA · Reposted 1 month ago\n$60K/yr - $65K/yr\nHybrid\nFull-time", {
    ".job-details-jobs-unified-top-card__job-title h1": element("MS 365 Support Engineer"),
    ".job-details-jobs-unified-top-card__company-name a": element("LTM"),
  });
  const document = page({
    ".job-details-jobs-unified-top-card": topCard,
    "#job-details": element("About the job\nProvide Microsoft 365 support to business users."),
  }, {
    'script[type="application/ld+json"]': [],
  });

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/view/2234567890");
  assert.equal(result.location, "Bellevue, WA");
  assert.equal(result.salary, "$60K/yr - $65K/yr");
  assert.equal(result.locationType, "Hybrid");
  assert.equal(result.positionType, "Full-time");
});

test("expands beyond LinkedIn's compact top card to capture visible preference chips", async () => {
  const titleNode = element("IT Support Specialist");
  const compactTopCard = element("HighlightTA\nIT Support Specialist", {
    ".job-details-jobs-unified-top-card__job-title h1": titleNode,
    ".job-details-jobs-unified-top-card__company-name a": element("HighlightTA"),
  });
  const selectedDetailPanel = element("HighlightTA\nIT Support Specialist\nToronto, ON · 4 days ago · Over 100 people clicked apply\n55K CAD/yr - 65K CAD/yr\nHybrid\nFull-time\nApply\nSave");
  titleNode.parentElement = compactTopCard;
  compactTopCard.parentElement = selectedDetailPanel;
  const document = page({
    ".job-details-jobs-unified-top-card": compactTopCard,
    "#job-details": element("About the job\nAbout StickerYou\nProvide day-to-day IT support."),
  }, {
    'script[type="application/ld+json"]': [],
  });

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/view/4457391025");
  assert.equal(result.location, "Toronto, ON");
  assert.equal(result.salary, "55K CAD/yr - 65K CAD/yr");
  assert.equal(result.locationType, "Hybrid");
  assert.equal(result.positionType, "Full-time");
});

test("captures LinkedIn's separate base-pay and employment-detail sections", async () => {
  const topCard = element("IT Support Specialist\nHighlightTA\nToronto, Ontario, Canada", {
    ".top-card-layout__title": element("IT Support Specialist"),
    ".topcard__org-name-link": element("HighlightTA"),
    ".topcard__flavor--bullet": element("Toronto, Ontario, Canada"),
  });
  const document = page({
    ".top-card-layout": topCard,
    ".compensation__salary-range": element("Base pay range\nCA$55,000.00/yr - CA$65,000.00/yr"),
    ".description__text": element("About StickerYou\nProvide day-to-day IT support."),
  }, {
    'script[type="application/ld+json"]': [],
    ".description__job-criteria-list": [element("Employment type\nFull-time")],
  });

  const result = await extractorFor(document, "https://www.linkedin.com/jobs/view/4457391025");
  assert.equal(result.salary, "CA$55,000.00/yr - CA$65,000.00/yr");
  assert.equal(result.positionType, "Full-time");
});

test("extracts Indeed's Full job description section", async () => {
  const document = page({
    '[data-testid="jobsearch-JobInfoHeader-title"]': element("IT Specialist"),
    '[data-testid="inlineHeader-companyName"]': element("Nurse Next Door"),
    '[data-testid="inlineHeader-companyLocation"]': element("1788 West 5th Avenue, Vancouver, BC V6J 1P2"),
    "#jobDescriptionText": element("Full job description\nAt Nurse Next Door, we believe in Making Lives Better.\n\nThe IT Specialist provides reliable day-to-day IT services.\n\nReport job"),
  }, {
    'script[type="application/ld+json"]': [],
    'h1,h2,h3,h4,[role="heading"]': [],
  });

  const result = await extractorFor(document, "https://ca.indeed.com/viewjob?jk=example");
  assert.equal(result.company, "Nurse Next Door");
  assert.equal(result.role, "IT Specialist");
  assert.equal(result.location, "1788 West 5th Avenue, Vancouver, BC V6J 1P2");
  assert.match(result.description, /^At Nurse Next Door/);
  assert.match(result.description, /reliable day-to-day IT services/);
  assert.doesNotMatch(result.description, /Full job description|Report job/i);
});

test("finds Indeed's Full job description by its visible heading when selectors change", async () => {
  const descriptionHeading = element("Full job description");
  const firstParagraph = element("At Nurse Next Door, we believe in Making Lives Better and responsible technology adoption across our network.");
  const secondParagraph = element("The IT Specialist provides reliable day-to-day IT services and coordinates technology initiatives.");
  descriptionHeading.nextElementSibling = firstParagraph;
  firstParagraph.nextElementSibling = secondParagraph;
  const document = page({
    "h1": element("IT Specialist"),
    '[data-company-name="true"]': element("Nurse Next Door"),
  }, {
    'script[type="application/ld+json"]': [],
    'h1,h2,h3,h4,[role="heading"]': [descriptionHeading],
  });

  const result = await extractorFor(document, "https://ca.indeed.com/viewjob?jk=changed-markup");
  assert.match(result.description, /^At Nurse Next Door/);
  assert.match(result.description, /coordinates technology initiatives/);
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

test("loads the dedicated extractor in extension version 1.1.4", async () => {
  const [popup, manifestText] = await Promise.all([
    readFile(new URL("../extensions/applitrail-job-importer/popup.html", import.meta.url), "utf8"),
    readFile(new URL("../extensions/applitrail-job-importer/manifest.json", import.meta.url), "utf8"),
  ]);
  assert.ok(popup.indexOf('src="extract-job-posting.js"') < popup.indexOf('src="popup.js"'));
  assert.equal(JSON.parse(manifestText).version, "1.1.4");
});
