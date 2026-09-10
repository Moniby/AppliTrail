import { expect, request as createRequest, test, type APIRequestContext, type Page } from "@playwright/test";

const ownerId = "e2e-owner";
const ownerHeaders = {
  "oai-authenticated-user-id": ownerId,
  "oai-authenticated-user-email": "journey.owner@applitrail.test",
  "oai-authenticated-user-full-name": "Journey Owner",
};

async function prepareOwner(api: APIRequestContext, paid = false) {
  await api.delete("/api/account");
  const accepted = await api.post("/api/account", { data: { action: "accept-policies" } });
  expect(accepted.ok()).toBeTruthy();
  if (paid) {
    const checkout = await api.post("/api/billing", {
      data: {
        action: "checkout",
        productId: "basic_monthly",
        quantity: 1,
        requestId: crypto.randomUUID(),
      },
    });
    expect(checkout.ok()).toBeTruthy();
    expect((await checkout.json()).account.plan).toBe("basic");
  }
}

async function dismissExtensionAnnouncement(page: Page) {
  const dismiss = page.getByRole("button", { name: "Don’t show this again" });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

test("public launch and sign-in pages remain available without an account", async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    extraHTTPHeaders: {
      "oai-authenticated-user-id": "",
      "oai-authenticated-user-email": "",
      "oai-authenticated-user-full-name": "",
    },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveTitle(/AppliTrail/i);
  await expect(page.getByRole("heading", { name: /Move every job application forward/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create your AppliTrail account" })).toBeVisible();
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Continue with Google", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue with ChatGPT or email", exact: true })).toBeVisible();
  await context.close();
});

test("paid customer can save, prepare, remind, reload, find, and delete an application", async ({ page, request }) => {
  await prepareOwner(request, true);
  await page.addInitScript((userId) => {
    localStorage.setItem(`applitrail-extension-announcement-v1-${userId}`, "dismissed");
  }, ownerId);

  await page.route("**/api/tailor-cv", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        document: "JOURNEY OWNER\n\nPROFESSIONAL SUMMARY\nGenerated CV for browser journey verification.",
        score: 92,
        status: "Strong evidence match",
        matched_requirements: ["Customer support"],
        added_or_emphasized: ["Issue resolution"],
        unsupported_requirements: [],
        review_questions: [],
        model: "gpt-5.6-sol",
      }),
    });
  });

  await page.goto("/app");
  await dismissExtensionAnnouncement(page);
  await expect(page.getByRole("heading", { name: "Hi, Journey" })).toBeVisible();
  await page.getByRole("button", { name: /New application/ }).click();
  await expect(page.getByRole("heading", { name: "Add an application" })).toBeVisible();
  await page.getByLabel("Company", { exact: true }).fill("World Class Systems");
  await page.getByLabel("Job title", { exact: true }).fill("Customer Journey Analyst");
  await page.locator('select[name="positionType"]').selectOption("Full-time");
  await page.getByLabel("Sector", { exact: true }).fill("Technology");
  await page.getByLabel("Location", { exact: true }).fill("Toronto, ON");
  await page.locator('select[name="locationType"]').selectOption("Hybrid");
  await page.getByLabel("Salary (optional)", { exact: true }).fill("CAD 80,000–90,000");
  await page.getByLabel("Job description", { exact: true }).fill("Support customer journeys, resolve issues, document outcomes, and collaborate across teams.");
  await page.getByRole("button", { name: "Save & prepare" }).click();

  await expect(page.getByRole("heading", { name: "Application workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer Journey Analyst" })).toBeVisible();
  await expect(page.getByText("APPLICATION WORKFLOW")).toBeVisible();
  await expect(page.getByRole("button", { name: /Next: Documents/ })).toBeVisible();
  await page.getByRole("button", { name: /New application/ }).click();
  await expect(page.getByRole("heading", { name: "Add an application" })).toBeVisible();
  const modalLayer = await page.locator(".overlay").evaluate((element) => Number(getComputedStyle(element).zIndex));
  const workspaceLayer = await page.locator(".application-workspace-tabs").evaluate((element) => Number(getComputedStyle(element).zIndex));
  expect(modalLayer).toBeGreaterThan(workspaceLayer);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /Follow-up/ }).click();
  await expect(page.locator(".prep")).toBeHidden();
  await expect(page.getByText(/Working on Customer Journey Analyst at World Class Systems/)).toBeVisible();
  const taskStudio = page.locator(".application-task-studio");
  await taskStudio.getByLabel("Task", { exact: true }).fill("Follow up with recruiter");
  await taskStudio.getByLabel("Reminder date", { exact: true }).fill("2026-09-15");
  await page.getByRole("button", { name: /Add reminder task/ }).click();
  await expect(page.getByText("Follow up with recruiter", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Dashboard/ }).click();
  await page.getByRole("tab", { name: /Reminders \(1\)/ }).click();
  await page.getByRole("button", { name: "Cancel reminder" }).click();
  await expect(page.getByRole("heading", { name: "Cancel this reminder?" })).toBeVisible();
  await page.locator(".confirm-modal").getByRole("button", { name: "Cancel reminder" }).click();
  await expect(page.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();

  await page.getByRole("button", { name: /Applications/ }).click();
  await page.getByRole("button", { name: /Prepare for Customer Journey Analyst/i }).click();

  await page.getByRole("button", { name: /^STEP 4 Preparation/ }).click();
  await page.getByRole("button", { name: /Tailor my CV/ }).click();
  await expect(page.getByRole("heading", { name: "Use 1 AI credit?" })).toBeVisible();
  await page.getByRole("button", { name: "Use 1 credit & generate" }).click();
  await expect(page.getByLabel("Edit Tailored CV")).toHaveValue(/Generated CV for browser journey verification/);

  await page.reload();
  await dismissExtensionAnnouncement(page);
  await page.getByRole("button", { name: /Applications/ }).click();
  await expect(page.getByText("World Class Systems", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Prepare for Customer Journey Analyst/i }).click();
  await expect(page.getByRole("heading", { name: "Application workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer Journey Analyst" })).toBeVisible();

  await page.getByRole("button", { name: /Applications/ }).click();
  await page.getByLabel("Search applications").fill("World Class Systems");
  await expect(page.getByText("Customer Journey Analyst", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Customer Journey Analyst at World Class Systems" }).click();
  await expect(page.getByRole("heading", { name: "Delete this application?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete application" }).click();
  await expect(page.getByText("No applications match these controls")).toBeVisible();

  const stateResponse = await request.get("/api/state");
  expect(stateResponse.ok()).toBeTruthy();
  expect((await stateResponse.json()).state.apps).toHaveLength(0);
});

test("CV files and administrator user search work through the hosted interfaces", async ({ page, request, baseURL }) => {
  await prepareOwner(request);
  const upload = await request.post("/api/resumes", {
    multipart: {
      file: {
        name: "journey-owner.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% AppliTrail browser journey"),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const resume = (await upload.json()).resume;
  const reopened = await request.get(`/api/resumes?id=${encodeURIComponent(resume.id)}`);
  expect(reopened.ok()).toBeTruthy();
  expect(await reopened.text()).toContain("AppliTrail browser journey");

  const secondary = await createRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      "oai-authenticated-user-id": "e2e-search-user",
      "oai-authenticated-user-email": "find.journey@applitrail.test",
      "oai-authenticated-user-full-name": "Find Journey",
    },
  });
  await secondary.get("/api/state");
  await secondary.dispose();

  await page.addInitScript((userId) => localStorage.setItem(`applitrail-extension-announcement-v1-${userId}`, "dismissed"), ownerId);
  await page.goto("/app");
  await page.getByRole("button", { name: /Admin dashboard/ }).click();
  await expect(page.getByRole("heading", { name: "Admin dashboard" })).toBeVisible();
  await page.getByLabel("Find a user").fill("find.journey");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("find.journey@applitrail.test", { exact: true })).toBeVisible();
});

test("mobile navigation keeps the essential workspace reachable", async ({ page, request }) => {
  await prepareOwner(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((userId) => localStorage.setItem(`applitrail-extension-announcement-v1-${userId}`, "dismissed"), ownerId);
  await page.goto("/app");
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: /Applications/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Master CV/ })).toBeVisible();
  await page.getByRole("button", { name: /Master CV/ }).click();
  await expect(page.getByRole("heading", { name: "Master CV", exact: true })).toBeVisible();
});
