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

    const topCard = isLinkedIn ? (
      document.querySelector(".job-details-jobs-unified-top-card")
      || document.querySelector(".jobs-unified-top-card")
      || document.querySelector(".top-card-layout")
      || document.querySelector(".jobs-search__job-details--container")
      || document.querySelector('[class*="jobs-unified-top-card"]')
    ) : null;
    const linkedInScopes = topCard ? [topCard, document] : [document];

    let title = isLinkedIn ? pickWithin(linkedInScopes, [
      ".job-details-jobs-unified-top-card__job-title h1",
      ".job-details-jobs-unified-top-card__job-title",
      ".jobs-unified-top-card__job-title h1",
      ".jobs-unified-top-card__job-title",
      'h1[class*="job-title"]',
      ".top-card-layout__title",
    ], 300) : "";
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
    if (isLinkedIn) description = description.replace(/^About the job\s*/i, "").trim();

    const organization = jsonLd?.hiringOrganization;
    if (!title) title = tidy(jsonLd?.title || pickWithin([document], ["h1", 'meta[property="og:title"]', "title"], 300), 300);
    if (isLinkedIn) title = title.replace(/\s*[|·-]\s*LinkedIn\s*$/i, "").trim();
    if (!company) company = tidy(typeof organization === "object" ? organization?.name : organization || pickWithin([document], ['[data-testid*="company"]', '[class*="company"]', '[class*="employer"]'], 300), 300);
    if (!description) description = tidyDescription(jsonLd?.description || pickWithin([document], ['[data-testid*="description"]', '[class*="job-description"]', '[id*="job-description"]', "main article"], 40000, true), 40000);

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
    if (isLinkedIn && locationText) locationText = locationText.split(/\s+[·•]\s+/)[0].trim();
    const jobLocation = tidy(locationText || structuredLocation || pickWithin([document], ['[data-testid*="location"]', '[class*="location"]'], 500), 500);

    const linkedInMetadata = isLinkedIn ? collectWithin(topCard ? [topCard] : [document], [
      ".job-details-jobs-unified-top-card__job-insight",
      ".jobs-unified-top-card__job-insight",
      '[class*="job-insight"]',
      ".job-details-fit-level-preferences button",
      ".job-details-fit-level-preferences span",
      ".job-details-preferences-and-skills button",
      ".job-details-preferences-and-skills span",
    ]) : "";
    const employment = tidy(jsonLd?.employmentType || linkedInMetadata, 1000).toLowerCase();
    const positionType = /\bcontract(?:or)?\b/.test(employment) ? "Contract"
      : /\bpart[ -]?time\b/.test(employment) ? "Part-time"
      : /\bintern(?:ship)?\b/.test(employment) ? "Internship"
      : /\bvolunteer\b/.test(employment) ? "Volunteer"
      : /\bfull[ -]?time\b/.test(employment) ? "Full-time"
      : "";
    const workplaceEvidence = isLinkedIn ? linkedInMetadata.toLowerCase() : `${title} ${description}`.toLowerCase();
    const locationType = /\bremote\b/.test(workplaceEvidence) ? "Remote"
      : /\bhybrid\b/.test(workplaceEvidence) ? "Hybrid"
      : /\bon[ -]?site\b|\bin[ -]?office\b/.test(workplaceEvidence) ? "Onsite"
      : "";

    const salaryValue = jsonLd?.baseSalary?.value;
    const salaryRange = typeof salaryValue === "object"
      ? [salaryValue?.minValue, salaryValue?.maxValue].filter((value) => value !== undefined && value !== null).join("–")
      : salaryValue;
    const salary = tidy([jsonLd?.baseSalary?.currency, salaryRange, salaryValue?.unitText].filter(Boolean).join(" ") || pickWithin(linkedInScopes, ['[class*="salary"]'], 200), 200);
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
