import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the public AppliTrail launch page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>AppliTrail \| Job Application Studio<\/title>/i);
  assert.match(html, /Move every job application forward with confidence/i);
  assert.match(html, /Google sign-in available/i);
  assert.match(html, /Download the Chrome &amp; Edge extension/i);
  assert.match(html, /Can I save a job directly from a job board/i);
  assert.match(html, /Private by design/i);
  assert.match(html, /Professional Word and PDF CV formats/i);
  assert.match(html, /Track up to 3 applications/i);
  assert.match(html, /Create up to 2 Master CVs/i);
  assert.match(html, /Unlimited application tracking/i);
  assert.match(html, /Unlimited Master CVs/i);
  assert.match(html, /1 month plan/i);
  assert.match(html, /Quarterly plan/i);
  assert.match(html, /What’s included/i);
  assert.match(html, /SIMPLE PRICING · LOCAL CHECKOUT/i);
  assert.doesNotMatch(html, /CAD BASE/i);
  assert.match(html, /Paying outside Canada[\s\S]*No worries/i);
  assert.match(html, /Track and Remind/i);
  assert.match(html, /Keep track of each application and set reminders when necessary/i);
  assert.match(html, /✕/);
  assert.doesNotMatch(html, /Always free/i);
  assert.doesNotMatch(html, /Cancel anytime/i);
  assert.doesNotMatch(html, /Month-to-month billing/i);
  assert.match(html, /unused included credits roll over during the paid term/i);
  assert.match(html, /Frequently asked questions/i);
  assert.match(html, /What happens if my Basic or Standard subscription is not renewed/i);
  assert.match(html, /You cannot add another application until you renew/i);
  assert.match(html, /Is there a limit on rolled-over AI credits/i);
  assert.match(html, /Basic can hold up to 30 credits on Quarterly, 60 on 6-month and 120 on Annual/i);
  assert.match(html, /Purchased extra credits do not expire/i);
});

test("uses direct navigation for the protected dashboard handoff", async () => {
  const landingSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(landingSource, /from "next\/link"/);
  assert.match(landingSource, /<a className="landing-signin" href="\/app">Open dashboard<\/a>/);
  assert.match(landingSource, /href="\/signin"/);
});

test("server-renders the browser extension installation guide", async () => {
  const response = await render("/extension");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Browser Extension \| AppliTrail<\/title>/i);
  assert.match(html, /Save a job ad without starting from scratch/i);
  assert.match(html, /Download for Chrome &amp; Edge/i);
  assert.match(html, /VERSION 1\.1\.5/i);
  assert.match(html, /applitrail-job-importer-v1\.1\.5\.zip/i);
  assert.match(html, /select Reload on your browser’s extensions page/i);
  assert.match(html, /chrome:\/\/extensions/i);
  assert.match(html, /edge:\/\/extensions/i);
  assert.match(html, /Load unpacked/i);
  assert.match(html, /Runs only when you click it/i);
});

test("uses the approved AppliTrail logo across public and account surfaces", async () => {
  const [landing, signIn, dashboard, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../public/applitrail-logo.png", import.meta.url)),
  ]);
  assert.match(landing, /<AppliTrailLogo \/>/);
  assert.match(signIn, /<AppliTrailLogo \/>/);
  assert.match(dashboard, /<AppliTrailLogo \/>/);
  assert.match(layout, /icon: "\/applitrail-logo\.png"/);
  const logoComponent = await readFile(new URL("../app/applitrail-logo.tsx", import.meta.url), "utf8");
  assert.match(logoComponent, /<img[^>]+src="\/applitrail-logo\.png"[^>]+alt=""/);
  assert.doesNotMatch(landing, /<span>A<\/span>AppliTrail/);
  assert.doesNotMatch(signIn, /<span>A<\/span>AppliTrail/);
  assert.doesNotMatch(dashboard, /className="mark">A/);
});

test("declares portable account, database and file-storage boundaries", async () => {
  const [hostingText, schema, stateRoute, resumeRoute, extractResumeRoute, generateRoute, accountRoute, adminRoute, billingRoute, stripeWebhookRoute, stripeBilling, dashboard, publicPricing, preparationDocx, accountStore, phaseThreeMigration, allowanceMigration, loginAuditMigration, billingMigration, billingIntervalMigration, stripeWebhookMigration, appSettingsMigration, rolloverMigration] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/resumes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/extract-resume/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate-application-material/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/billing/webhook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/stripe-billing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public-pricing.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/preparation-docx.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/appliflow-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_free_bucky.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_windy_rawhide_kid.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_colossal_prowler.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_famous_sumo.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_medical_stellaris.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_easy_whizzer.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0007_numerous_gorilla_man.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0008_flat_titanium_man.sql", import.meta.url), "utf8"),
  ]);
  const hosting = JSON.parse(hostingText);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "RESUMES");
  assert.match(schema, /sqliteTable\("users"/);
  assert.match(schema, /sqliteTable\("user_states"/);
  assert.match(schema, /sqliteTable\(\s*"ai_usage"/);
  assert.match(schema, /sqliteTable\(\s*"login_events"/);
  assert.match(schema, /sqliteTable\(\s*"billing_transactions"/);
  assert.match(schema, /sqliteTable\(\s*"stripe_webhook_events"/);
  assert.match(schema, /sqliteTable\("app_settings"/);
  assert.match(schema, /accountStatus: text\("account_status"\)/);
  assert.match(schema, /billingInterval: text\("billing_interval"\)/);
  assert.match(schema, /rolloverCredits: integer\("rollover_credits"\)/);
  assert.match(stateRoute, /requestUser\(request\)/);
  assert.match(stateRoute, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(stateRoute, /salary: 200/);
  assert.match(stateRoute, /rejectionComment: 10_000/);
  assert.match(stateRoute, /interviewNotes: 20_000/);
  assert.match(stateRoute, /safe\.stageHistory = stageHistory\.length/);
  assert.match(stateRoute, /schemaVersion: 8/);
  assert.match(stateRoute, /safe\.customTasks/);
  assert.match(stateRoute, /hasPaidPlanFeatures\(account\.plan\)/);
  assert.match(stateRoute, /planResourceLimits\(account\.plan\)/);
  assert.match(stateRoute, /state\.apps\.length > limits\.applications/);
  assert.match(stateRoute, /state\.masterCvs\.length > limits\.masterCvs/);
  assert.match(stateRoute, /searchParams\.get\("migration"\) === "1"/);
  assert.match(stateRoute, /previousTasks/);
  assert.match(stateRoute, /safe\.positionType/);
  assert.match(stateRoute, /safe\.locationType/);
  assert.match(stateRoute, /customSections/);
  assert.match(stateRoute, /sectionOrder/);
  assert.match(stateRoute, /getUserCreditAudit\(identity\.userId\)/);
  assert.match(resumeRoute, /resumeKey\(identity\.userId/);
  assert.match(extractResumeRoute, /beginGeneration\(identity, "resume_extract", MODEL, false\)/);
  assert.match(extractResumeRoute, /type: "input_file"/);
  assert.match(extractResumeRoute, /Never invent, infer, improve or complete facts/);
  assert.match(extractResumeRoute, /suggested_master_cv_name/);
  assert.match(generateRoute, /Markdown section headers/);
  assert.match(accountRoute, /action === "record-login"/);
  assert.match(accountRoute, /recordLoginEvent/);
  assert.match(adminRoute, /setAccountStatus/);
  assert.match(adminRoute, /setMonthlyAllowance/);
  assert.match(adminRoute, /setAdminRole/);
  assert.match(adminRoute, /payload\.action === "role"/);
  assert.match(adminRoute, /adminUserDetail/);
  assert.match(adminRoute, /searchParams\.get\("userId"\)/);
  assert.match(adminRoute, /searchParams\.get\("q"\)/);
  assert.match(phaseThreeMigration, /ALTER TABLE `users` ADD `account_status`/);
  assert.match(allowanceMigration, /`monthly_allowance` integer DEFAULT 5 NOT NULL/);
  assert.match(allowanceMigration, /SET `monthly_allowance` = 5/);
  assert.match(loginAuditMigration, /CREATE TABLE `login_events`/);
  assert.match(loginAuditMigration, /CREATE INDEX `idx_login_events_user_created`/);
  assert.match(billingMigration, /CREATE TABLE `billing_transactions`/);
  assert.match(billingMigration, /`monthly_allowance` integer DEFAULT 2 NOT NULL/);
  assert.match(billingIntervalMigration, /ADD `billing_interval` text DEFAULT 'monthly' NOT NULL/);
  assert.match(billingRoute, /completeDemoCheckout/);
  assert.match(billingRoute, /scheduleSubscriptionCancellation/);
  assert.match(billingRoute, /createStripeCheckout/);
  assert.match(billingRoute, /createStripePortal/);
  assert.match(billingRoute, /reconcileStripeCheckout/);
  assert.match(billingRoute, /syncStripeBilling/);
  assert.doesNotMatch(billingRoute, /ensureStripePortalConfiguration/);
  assert.match(stripeWebhookRoute, /request\.text\(\)/);
  assert.match(stripeWebhookRoute, /stripe-signature/);
  assert.match(stripeWebhookRoute, /processStripeWebhookEvent/);
  assert.match(stripeBilling, /2026-02-25\.clover/);
  assert.match(stripeBilling, /mode: isCreditPurchase \? "payment" : "subscription"/);
  assert.match(stripeBilling, /adaptive_pricing\[enabled\]/);
  assert.match(stripeBilling, /locale: "auto"/);
  assert.match(stripeBilling, /subscription_data\[metadata\]\[user_id\]/);
  assert.match(stripeBilling, /billing_portal\/sessions/);
  assert.match(stripeBilling, /billing_portal\/configurations/);
  assert.match(stripeBilling, /features\[subscription_update\]\[products\]/);
  assert.match(stripeBilling, /crypto\.subtle\.sign\("HMAC"/);
  assert.match(stripeBilling, /Idempotency-Key/);
  assert.match(stripeBilling, /isStripeCustomerId/);
  assert.match(stripeBilling, /isStripeSubscriptionId/);
  assert.match(stripeBilling, /ensureStripeCatalog/);
  assert.match(stripeBilling, /stripe_catalog_account_id/);
  assert.match(stripeBilling, /AppliTrail Extra AI Credit/);
  assert.match(stripeBilling, /Stripe test mode requires a Stripe test secret key/);
  assert.match(stripeBilling, /checkout\.session\.completed/);
  assert.match(stripeBilling, /This Stripe checkout does not belong to the signed-in AppliTrail account/);
  assert.match(stripeBilling, /Extra AI credits are available only on Basic and Standard plans/);
  assert.match(accountStore, /Extra AI credits are available only on Basic and Standard plans/);
  assert.match(stripeWebhookMigration, /CREATE TABLE `stripe_webhook_events`/);
  assert.match(appSettingsMigration, /CREATE TABLE `app_settings`/);
  assert.match(rolloverMigration, /ADD `rollover_credits` integer DEFAULT 0 NOT NULL/);
  assert.match(rolloverMigration, /ADD `rollover_expires_at` text/);
  assert.match(dashboard, /Import my data/);
  assert.match(dashboard, /Delete account data/);
  assert.match(dashboard, /Add to calendar/);
  assert.match(dashboard, /Add reminder task/);
  assert.match(dashboard, /className="header-signout"/);
  assert.match(dashboard, /aria-label=\{`Sign out \$\{signedInName\}`\}/);
  assert.match(dashboard, /Application reminders/);
  assert.match(dashboard, /Task marked complete/);
  assert.match(dashboard, /Select position type/);
  assert.match(dashboard, /Select location type/);
  assert.match(dashboard, /Filter by stage/);
  assert.match(dashboard, /Sort by/);
  assert.match(dashboard, /Group by/);
  assert.match(dashboard, /Suspend/);
  assert.match(dashboard, /Monthly limit/);
  assert.match(dashboard, /action:"allowance"/);
  assert.match(dashboard, /AppliTrail does not scrape LinkedIn/);
  assert.match(dashboard, /Export all to Excel/);
  assert.match(dashboard, /Excel application export/);
  assert.match(dashboard, /PaidFeatureGate/);
  assert.match(dashboard, /Unlock formatted CV downloads/);
  assert.match(dashboard, /Stay on schedule with reminders/);
  assert.match(dashboard, /paidFeatures=isPaidPlan\(account\?\.plan\)/);
  assert.match(dashboard, /AGE IN STAGE/);
  assert.match(dashboard, /Rejection comment/);
  assert.match(dashboard, /Interview notes/);
  assert.match(dashboard, /Stage ageing/);
  assert.match(dashboard, /APPLICATION AGE/);
  assert.match(dashboard, /since application/);
  assert.match(dashboard, /generation-progress-bar/);
  assert.match(dashboard, /actively comparing the saved job description/);
  assert.match(dashboard, /Review your CV/);
  assert.match(dashboard, /Upload & extract CV/);
  assert.match(dashboard, /Save Master CV/);
  assert.match(dashboard, /APPLITRAIL_JOB_IMPORT/);
  assert.match(dashboard, /BROWSER JOB IMPORT/);
  assert.match(dashboard, /Review this opportunity/);
  assert.match(dashboard, /Job imported from your browser/);
  assert.match(dashboard, /Save jobs directly from your browser/);
  assert.match(dashboard, /Don’t show this again/);
  assert.match(dashboard, /Import from browser/);
  assert.match(dashboard, /Browser extension/);
  assert.match(dashboard, /applitrail-extension-announcement-v1-/);
  assert.match(dashboard, /Master CV Name/);
  assert.match(dashboard, /Technical tools & technologies/);
  assert.match(dashboard, /Custom section/);
  assert.match(dashboard, /No user credit used/);
  assert.match(dashboard, /No AI credit will be used/);
  assert.match(dashboard, /Upload &amp; extract/);
  assert.match(dashboard, /Download DOCX/);
  assert.match(dashboard, /await import\("\.\/preparation-docx"\)/);
  assert.match(dashboard, /PreparationPreview/);
  assert.match(dashboard, /FORMATTED PREVIEW/);
  assert.match(dashboard, /Credit usage audit/i);
  assert.match(dashboard, /AI CREDIT CONFIRMATION/);
  assert.match(dashboard, /Use 1 credit & generate/);
  assert.match(dashboard, /1 credit is charged only when generation succeeds/);
  assert.match(dashboard, /YOUR AI CREDIT HISTORY/);
  assert.match(dashboard, /Failed attempts and CV extraction do not use a credit/);
  assert.match(dashboard, /SANDBOX · NO CARD CHARGED/);
  assert.match(dashboard, /PLANS & BILLING/);
  assert.match(dashboard, /Buy credits/);
  assert.match(dashboard, /Available on paid plans/);
  assert.match(publicPricing, /Extra-credit purchases are not available on the Free plan/);
  assert.match(publicPricing, /Credit rollover on longer billing terms/);
  assert.match(publicPricing, /At checkout, you will see the equivalent in your local currency/);
  assert.match(dashboard, /BILLING FREQUENCY/);
  assert.match(dashboard, /billing-frequency-select/);
  assert.match(dashboard, /planTermBadge/);
  assert.doesNotMatch(dashboard, /Cancel anytime/);
  assert.doesNotMatch(dashboard, /Always free/);
  assert.match(dashboard, /Save \$\{interval\.savingsPercent\}%/);
  assert.match(dashboard, /Change billing frequency/);
  assert.match(dashboard, /Activate with Stripe/);
  assert.match(dashboard, /CURRENT SUBSCRIPTION/);
  assert.match(dashboard, /Stripe subscription confirmed/);
  assert.match(dashboard, /Your \$\{planName\(currentPlan\)\} plan includes up to/);
  assert.match(dashboard, /Unlimited application tracking/);
  assert.match(dashboard, /Unlimited Master CVs/);
  assert.match(dashboard, /ROLLED OVER/);
  assert.match(dashboard, /unused credits roll over through the billing term/);
  assert.match(accountStore, /credit_rollover_extension/);
  assert.match(accountStore, /credit_rollover_expiry/);
  assert.match(accountStore, /renewalRolloverBalance/);
  assert.match(dashboard, /PAYMENT AUDIT/);
  assert.match(dashboard, /View details/);
  assert.match(dashboard, /account\?\.isAdmin&&<button/);
  assert.match(dashboard, /Admin dashboard/);
  assert.match(dashboard, /view==="admin"&&account\?\.isAdmin/);
  assert.match(dashboard, /adminView/);
  assert.match(dashboard, /Make admin/);
  assert.match(dashboard, /Remove admin/);
  assert.match(dashboard, /Search by name, email or user ID/);
  assert.match(dashboard, /No users match this search/);
  assert.match(dashboard, /roleConfirmation/);
  assert.match(dashboard, /admin-plan-meta/);
  assert.match(dashboard, /Login information/);
  assert.match(dashboard, /Passwords, IP addresses/);
  assert.match(dashboard, /action:"record-login"/);
  assert.match(dashboard, /\^\[\\s\]\*\[=\+\\-@\]/);
  assert.match(dashboard, /const loggedInIdentity=account\?\?identity/);
  assert.match(dashboard, /view==="overview"\?`Hi, \$\{greetingName\}`/);
  assert.doesNotMatch(dashboard, /profile\.name\|\|account\?\.displayName/);
  assert.match(dashboard, /className="reminder-sidebar"/);
  assert.match(preparationDocx, /return Packer\.toBlob\(document\)/);
  assert.match(preparationDocx, /style: block\.level === 1 \? "PrepHeading1" : "PrepHeading2"/);
  assert.match(preparationDocx, /bold: true/);
  assert.match(preparationDocx, /format: LevelFormat\.DECIMAL/);
  assert.match(accountStore, /APPLIFLOW_ADMIN_EMAIL/);
  assert.match(accountStore, /identity\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(accountStore, /PLAN_CATALOG\.free\.allowance, isAdmin/);
  assert.match(accountStore, /free: \{ id: "free", name: "Free", allowance: 2/);
  assert.match(accountStore, /basic: \{ id: "basic", name: "Basic", allowance: 10/);
  assert.match(accountStore, /standard: \{ id: "standard", name: "Standard", allowance: 20/);
  assert.match(accountStore, /applicationLimit: 3, masterCvLimit: 2/);
  assert.match(accountStore, /applicationLimit: 10, masterCvLimit: 5/);
  assert.match(accountStore, /applicationLimit: null, masterCvLimit: null/);
  assert.match(accountStore, /planResourceLimits/);
  assert.match(accountStore, /applicationCreationLocked/);
  assert.match(accountStore, /has_paid_history/);
  assert.match(stateRoute, /All existing applications remain available, but renew Basic or Standard to add another/);
  assert.match(dashboard, /Renew to add applications/);
  assert.match(dashboard, /Your applications are safe/);
  assert.match(publicPricing, /Quarterly plan/);
  assert.match(publicPricing, /termBadge/);
  assert.doesNotMatch(publicPricing, /Cancel anytime/);
  assert.doesNotMatch(publicPricing, /Always free/);
  assert.match(publicPricing, /Save \$\{interval\.id === "quarterly"/);
  assert.match(publicPricing, /Track up to 3 applications/);
  assert.match(publicPricing, /Create up to 5 Master CVs/);
  assert.match(publicPricing, /Unlimited application tracking/);
  assert.match(accountStore, /EXTRA_CREDIT_PRICE_CENTS = 150/);
  assert.match(accountStore, /quarterly.*amounts: \{ basic: 2_800, standard: 4_200 \}/);
  assert.match(accountStore, /six_month.*amounts: \{ basic: 5_400, standard: 8_100 \}/);
  assert.match(accountStore, /annual.*amounts: \{ basic: 9_600, standard: 14_400 \}/);
  assert.match(accountStore, /addUtcMonths\(start, 1\)/);
  assert.match(accountStore, /hasPaidPlanFeatures/);
  assert.match(accountStore, /creditAudit: auditRows\.results/);
  assert.match(accountStore, /WHERE a\.status = 'succeeded'/);
  assert.match(accountStore, /getUserCreditAudit\(userId: string\)/);
  assert.match(accountStore, /WHERE user_id = \? AND status = 'succeeded'/);
  assert.match(accountStore, /chargeCredit = true/);
  assert.match(accountStore, /kind != 'resume_extract'/);
  assert.match(accountStore, /CREATE TABLE IF NOT EXISTS login_events/);
  assert.match(accountStore, /adminUserDetail/);
  assert.match(accountStore, /setAdminRole/);
  assert.match(accountStore, /LOWER\(u\.display_name\) LIKE \? ESCAPE '!'/);
  assert.match(accountStore, /userResultLimit: 100/);
  assert.match(accountStore, /You cannot change your own administrator role/);
  assert.match(accountStore, /admin_role_granted/);
  assert.match(accountStore, /admin_role_revoked/);
  assert.match(accountStore, /datetime\('now', '-5 minutes'\)/);
});

test("ships a container-safe runtime and GitHub Actions release path", async () => {
  const [database, worker, contracts, runtime, nodeRuntime, postgresRuntime, azureRuntime, identity, backup, dockerfile, compose, ci, release, nextConfig, packageJson, health, readiness] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/contracts.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/runtime-node.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/runtime-postgres.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/runtime-azure.ts", import.meta.url), "utf8"),
    readFile(new URL("../platform/identity.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/portable-backup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/container-release.yml", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ready/route.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(database, /cloudflare:workers/);
  assert.match(database, /requireRuntime\(\)\.database/);
  assert.match(worker, /initializeRuntime/);
  assert.match(contracts, /interface SqlDatabase/);
  assert.match(contracts, /interface ObjectStorage/);
  assert.match(runtime, /provider: "cloudflare"/);
  assert.match(runtime, /createNodeRuntime/);
  assert.match(nodeRuntime, /APPLITRAIL_DATA_DIR/);
  assert.match(nodeRuntime, /journal_mode = WAL/);
  assert.match(nodeRuntime, /class FileObjectStorage/);
  assert.match(postgresRuntime, /class PostgresDatabase/);
  assert.match(postgresRuntime, /INSERT INTO.*ON CONFLICT DO NOTHING/s);
  assert.match(postgresRuntime, /created_at::timestamptz/);
  assert.match(azureRuntime, /class AzureBlobStorage/);
  assert.match(identity, /APPLITRAIL_AUTH_GATEWAY_SECRET/);
  assert.match(identity, /gatewayIsTrusted/);
  assert.match(backup, /APPLITRAIL_RESTORE_CONFIRM/);
  assert.match(backup, /databaseSha256/);
  assert.match(dockerfile, /USER applitrail/);
  assert.match(dockerfile, /VOLUME \["\/data"\]/);
  assert.match(dockerfile, /\/api\/ready/);
  assert.match(compose, /applitrail-data:\/data/);
  assert.match(compose, /postgres:17-alpine/);
  assert.match(compose, /azure-storage\/azurite:3\.35\.0/);
  assert.match(ci, /npm run ci/);
  assert.match(ci, /npm run test:portable|smoke-portable-stack/);
  assert.match(release, /ghcr\.io\/moniby\/applitrail/);
  assert.match(release, /provenance: true/);
  assert.match(release, /sbom: true/);
  assert.match(nextConfig, /output: "standalone"/);
  assert.equal(JSON.parse(packageJson).dependencies.jspdf, "^4.2.1");
  assert.equal(JSON.parse(packageJson).dependencies.pg, "^8.23.0");
  assert.equal(JSON.parse(packageJson).dependencies["@azure/storage-blob"], "^12.33.0");
  assert.match(health, /status: "ok"/);
  assert.match(readiness, /runtimeReadiness/);
});
