(function registerAppliTrailJobExtractor(scope) {
  function extractJobPosting() {
    const tidy = (value, maximum = 1000) => typeof value === "string"
      ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
      : "";
    const tidyDescription = (value, maximum = 40000) => typeof value === "string"
      ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[\t ]+\n/g, "\n")
        .replace(/\n[\t ]+/g, "\n")
        .replace(/[\t ]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, maximum)
      : "";
    const nodeText = (node, maximum = 1000, preserveLines = false) => {
      const value = node?.getAttribute?.("content") || node?.innerText || node?.textContent || "";
      return preserveLines ? tidyDescription(value, maximum) : tidy(value, maximum);
    };
    const pickWithin = (scopes, selectors, maximum = 1000, preserveLines = false) => {
      for (const currentScope of scopes) {
        if (!currentScope?.querySelector) continue;
        for (const selector of selectors) {
          const value = nodeText(currentScope.querySelector(selector), maximum, preserveLines);
          if (value) return value;
        }
      }
      return "";
    };
    const pickNodeWithin = (scopes, selectors) => {
      for (const currentScope of scopes) {
        if (!currentScope?.querySelector) continue;
        for (const selector of selectors) {
          const node = currentScope.querySelector(selector);
          if (node && nodeText(node)) return node;
        }
      }
      return null;
    };
    const collectWithin = (scopes, selectors) => {
      const values = [];
      for (const currentScope of scopes) {
        if (!currentScope?.querySelectorAll) continue;
        for (const selector of selectors) {
          for (const node of currentScope.querySelectorAll(selector)) {
            const value = nodeText(node, 500);
            if (value) values.push(value);
          }
        }
      }
      return values.join(" · ");
    };
    const flattenJsonLd = (entry) => {
      if (!entry) return [];
      if (Array.isArray(entry)) return entry.flatMap(flattenJsonLd);
      if (typeof entry !== "object") return [];
      return [entry, ...flattenJsonLd(entry["@graph"]), ...flattenJsonLd(entry.mainEntity)];
    };
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap((node) => {
        try { return flattenJsonLd(JSON.parse(node.textContent || "null")); }
        catch { return []; }
      })
      .find((entry) => entry && (entry["@type"] === "JobPosting" || (Array.isArray(entry["@type"]) && entry["@type"].includes("JobPosting"))));
    const host = window.location.hostname.toLowerCase();
    const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
    const isIndeed = host === "indeed.com" || host.endsWith(".indeed.com");

    const topCard = isLinkedIn ? (
      document.querySelector(".job-details-jobs-unified-top-card")
      || document.querySelector(".jobs-unified-top-card")
      || document.querySelector(".top-card-layout")
      || document.querySelector(".jobs-search__job-details--container")
      || document.querySelector('[class*="jobs-unified-top-card"]')
    ) : null;
    const linkedInScopes = topCard ? [topCard, document] : [document];
    const linkedInTitleSelectors = [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title h1",
      ".jobs-unified-top-card__job-title",
      'h1[class*="job-title"]',
      ".top-card-layout__title",
    ];
    const linkedInTitleNode = isLinkedIn ? pickNodeWithin(linkedInScopes, linkedInTitleSelectors) : null;
    let title = nodeText(linkedInTitleNode, 300);
    let company = isLinkedIn ? pickWithin(linkedInScopes, [
      ".job-details-jobs-unified-top-card__company-name a",
      ".job-details-jobs-unified-top-card__company-name",
      ".jobs-unified-top-card__company-name a",
      ".jobs-unified-top-card__company-name",
      'a[href*="/company/"]',
      ".topcard__org-name-link",
      ".top-card-layout__card a[data-tracking-control-name*='company']",
    ], 300) : "";
    let description = isLinkedIn ? pickWithin([document], [
      "#job-details",
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".show-more-less-html__markup",
      ".description__text",
      '[class*="jobs-description__content"]',
    ], 40000, true) : "";
    const cleanLinkedInDescription = (value) => {
      let cleaned = tidyDescription(value, 60000);
      const aboutIndex = cleaned.toLowerCase().lastIndexOf("about the job");
      if (aboutIndex >= 0) cleaned = cleaned.slice(aboutIndex + "about the job".length).trim();
      const endMarkers = ["About the company", "Set alert for similar jobs", "Similar jobs", "People also viewed", "Show more jobs"];
      let end = cleaned.length;
      for (const marker of endMarkers) {
        const markerIndex = cleaned.toLowerCase().indexOf(`\n${marker.toLowerCase()}`);
        if (markerIndex >= 0 && markerIndex < end) end = markerIndex;
      }
      return cleaned.slice(0, end).replace(/^Show more\s*/i, "").replace(/\s*Show less$/i, "").trim().slice(0, 40000);
    };
    if (isLinkedIn) {
      description = cleanLinkedInDescription(description);
      if (!description) {
        const aboutHeading = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
          .find((node) => /^about the job$/i.test(nodeText(node, 100)));
        const candidates = [];
        if (aboutHeading?.nextElementSibling) candidates.push(aboutHeading.nextElementSibling);
        if (aboutHeading?.parentElement?.nextElementSibling) candidates.push(aboutHeading.parentElement.nextElementSibling);
        let ancestor = aboutHeading?.parentElement || null;
        for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) candidates.push(ancestor);
        for (const candidate of candidates) {
          const value = cleanLinkedInDescription(nodeText(candidate, 60000, true));
          if (value.length >= 80) { description = value; break; }
        }
      }
      if (!description) {
        const bodyText = nodeText(document.body, 100000, true);
        if (/about the job/i.test(bodyText)) description = cleanLinkedInDescription(bodyText);
      }
    }

    const cleanIndeedDescription = (value) => {
      let cleaned = tidyDescription(value, 60000);
      const headingIndex = cleaned.toLowerCase().indexOf("full job description");
      if (headingIndex >= 0) cleaned = cleaned.slice(headingIndex + "full job description".length).trim();
      const endMarkers = ["Report job", "Return to Search Result", "Hiring Lab", "Career advice", "Browse Jobs", "Browse Companies"];
      let end = cleaned.length;
      for (const marker of endMarkers) {
        const markerIndex = cleaned.toLowerCase().indexOf(`\n${marker.toLowerCase()}`);
        if (markerIndex >= 0 && markerIndex < end) end = markerIndex;
      }
      return cleaned.slice(0, end).replace(/^Show more\s*/i, "").replace(/\s*Show less$/i, "").trim().slice(0, 40000);
    };
    if (isIndeed) {
      description = cleanIndeedDescription(pickWithin([document], [
        "#jobDescriptionText",
        ".jobsearch-jobDescriptionText",
        '[data-testid="jobDescriptionText"]',
        '[data-testid="jobsearch-JobComponent-description"]',
        '[data-testid*="jobDescription"]',
        '[id*="jobDescription"]',
        '[class*="jobsearch-JobDescription"]',
      ], 60000, true));
      if (!description) {
        const fullDescriptionHeading = [...document.querySelectorAll('h1,h2,h3,h4,[role="heading"]')]
          .find((node) => /^full job description$/i.test(nodeText(node, 100)));
        const followingParts = [];
        let sibling = fullDescriptionHeading?.nextElementSibling || null;
        for (let count = 0; sibling && count < 40; count += 1, sibling = sibling.nextElementSibling) {
          if (/^H[1-4]$/.test(sibling.tagName || "") || sibling.getAttribute?.("role") === "heading") break;
          const value = nodeText(sibling, 60000, true);
          if (value) followingParts.push(value);
        }
        const candidates = [followingParts.join("\n\n")];
        if (fullDescriptionHeading?.parentElement?.nextElementSibling) candidates.push(nodeText(fullDescriptionHeading.parentElement.nextElementSibling, 60000, true));
        let ancestor = fullDescriptionHeading?.parentElement || null;
        for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) candidates.push(nodeText(ancestor, 60000, true));
        for (const candidate of candidates) {
          const value = cleanIndeedDescription(candidate);
          if (value.length >= 50) { description = value; break; }
        }
      }
      if (!description) {
        const bodyText = nodeText(document.body, 100000, true);
        if (/full job description/i.test(bodyText)) description = cleanIndeedDescription(bodyText);
      }
    }

    const organization = jsonLd?.hiringOrganization;
    if (!title) title = tidy(jsonLd?.title || pickWithin([document], isIndeed ? [
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      ".jobsearch-JobInfoHeader-title",
      "h1",
      'meta[property="og:title"]',
      "title",
    ] : ["h1", 'meta[property="og:title"]', "title"], 300), 300);
    if (isLinkedIn) title = title.replace(/\s*[|·-]\s*LinkedIn\s*$/i, "").trim();
    if (!company) company = tidy(typeof organization === "object" ? organization?.name : organization || pickWithin([document], isIndeed ? [
      '[data-testid="inlineHeader-companyName"]',
      '[data-company-name="true"]',
      ".jobsearch-InlineCompanyRating-companyHeader",
      '[data-testid*="company"]',
      '[class*="company"]',
      '[class*="employer"]',
    ] : ['[data-testid*="company"]', '[class*="company"]', '[class*="employer"]'], 300), 300);
    if (isLinkedIn && company && title.toLowerCase().endsWith(`| ${company}`.toLowerCase())) title = title.slice(0, -company.length - 2).trim();
    if (!description) description = tidyDescription(jsonLd?.description || pickWithin([document], ['[data-testid*="description"]', '[class*="job-description"]', '[id*="job-description"]', "main article"], 40000, true), 40000);

    let headerContext = topCard ? nodeText(topCard, 5000, true) : "";
    if (isLinkedIn && !headerContext && linkedInTitleNode) {
      let ancestor = linkedInTitleNode.parentElement;
      for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
        const value = nodeText(ancestor, 5000, true);
        if (value.length > title.length && /\b(?:remote|hybrid|on[ -]?site|full[ -]?time|part[ -]?time|contract)\b/i.test(value)) { headerContext = value; break; }
      }
    }

    const locationValue = Array.isArray(jsonLd?.jobLocation) ? jsonLd.jobLocation[0] : jsonLd?.jobLocation;
    const structuredLocation = typeof locationValue === "object"
      ? [locationValue?.address?.addressLocality, locationValue?.address?.addressRegion, locationValue?.address?.addressCountry].filter(Boolean).join(", ")
      : locationValue;
    let locationText = isLinkedIn ? pickWithin(linkedInScopes, [
      ".job-details-jobs-unified-top-card__primary-description-container",
      ".jobs-unified-top-card__subtitle-primary-grouping",
      ".jobs-unified-top-card__bullet",
      ".topcard__flavor--bullet",
    ], 500) : "";
    if (isLinkedIn && !locationText && headerContext) {
      const locationLine = headerContext.split("\n").map((line) => tidy(line, 500)).find((line) => /,\s*(?:[A-Z]{2}|Ontario|Quebec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Canada|United States)\b/.test(line) && !/\b(?:ago|applicants?|clicked apply)\b/i.test(line));
      if (locationLine) locationText = locationLine;
      else locationText = headerContext.match(/\b([A-Z][A-Za-z.' -]{1,45},\s*(?:[A-Z]{2}|Ontario|Quebec|British Columbia|Alberta|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|Newfoundland|Canada|United States))(?=\s*[·•]|\n|$)/)?.[1]
        || headerContext.match(/(?:^|\n)(Canada|United States|United Kingdom|Australia|Remote)(?=\s*[·•]|\n|$)/i)?.[1]
        || "";
    }
    if (isLinkedIn && locationText) locationText = locationText.split(/\s+[·•]\s+/)[0].trim();
    const jobLocation = tidy(locationText || structuredLocation || pickWithin([document], isIndeed ? [
      '[data-testid="job-location"]',
      '[data-testid="inlineHeader-companyLocation"]',
      ".jobsearch-JobInfoHeader-subtitle",
      '[data-testid*="location"]',
      '[class*="location"]',
    ] : ['[data-testid*="location"]', '[class*="location"]'], 500), 500);

    const linkedInMetadata = isLinkedIn ? collectWithin(topCard ? [topCard] : [document], [
      ".job-details-jobs-unified-top-card__job-insight",
      ".jobs-unified-top-card__job-insight",
      '[class*="job-insight"]',
      ".job-details-fit-level-preferences button",
      ".job-details-fit-level-preferences span",
      ".job-details-preferences-and-skills button",
      ".job-details-preferences-and-skills span",
    ]) : "";
    const linkedInCardEvidence = isLinkedIn ? tidyDescription([headerContext, linkedInMetadata].filter(Boolean).join("\n"), 10000) : "";
    const employment = tidy([jsonLd?.employmentType, linkedInCardEvidence].filter(Boolean).join(" "), 5000).toLowerCase();
    const positionType = /\bcontract(?:or)?\b/.test(employment) ? "Contract"
      : /\bpart[ -]?time\b/.test(employment) ? "Part-time"
      : /\bintern(?:ship)?\b/.test(employment) ? "Internship"
      : /\bvolunteer\b/.test(employment) ? "Volunteer"
      : /\bfull[ -]?time\b/.test(employment) ? "Full-time"
      : "";
    const workplaceEvidence = isLinkedIn ? linkedInCardEvidence.toLowerCase() : `${title} ${description}`.toLowerCase();
    const locationType = /\bremote\b/.test(workplaceEvidence) ? "Remote"
      : /\bhybrid\b/.test(workplaceEvidence) ? "Hybrid"
      : /\bon[ -]?site\b|\bin[ -]?office\b/.test(workplaceEvidence) ? "Onsite"
      : "";

    const salaryValue = jsonLd?.baseSalary?.value;
    const salaryRange = typeof salaryValue === "object"
      ? [salaryValue?.minValue, salaryValue?.maxValue].filter((value) => value !== undefined && value !== null).join("–")
      : salaryValue;
    const salaryCurrencyPattern = String.raw`(?:CAD|USD|GBP|EUR|AUD|NZD)`;
    const salaryAmountPattern = String.raw`(?:${salaryCurrencyPattern}\s*)?\$?\d[\d,.]*(?:\.\d+)?[KkMm]?(?:\s*${salaryCurrencyPattern})?(?:\s*\/\s*(?:yr|year|hr|hour|mo|month|wk|week))?`;
    const linkedInCardSalary = isLinkedIn
      ? pickWithin(linkedInScopes, ['[class*="salary"]'], 200)
        || linkedInCardEvidence.match(new RegExp(`${salaryAmountPattern}\\s*(?:-|–|—|to)\\s*${salaryAmountPattern}`, "i"))?.[0]
        || ""
      : "";
    const salary = tidy([jsonLd?.baseSalary?.currency, salaryRange, salaryValue?.unitText].filter(Boolean).join(" ") || linkedInCardSalary || pickWithin(linkedInScopes, ['[class*="salary"]'], 200), 200);
    let url = window.location.href;
    if (isLinkedIn) {
      const current = new URL(window.location.href);
      const jobId = current.searchParams.get("currentJobId") || current.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/i)?.[1];
      if (jobId) url = `https://www.linkedin.com/jobs/view/${jobId}`;
    }
    return { company, role: title, location: jobLocation, positionType, locationType, salary, description, url, capturedAt: new Date().toISOString() };
  }

  scope.AppliTrailJobExtractor = Object.freeze({ extractJobPosting });
})(globalThis);
