import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("server-renders the public AppliFlow launch page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>AppliFlow \| Job Application Studio<\/title>/i);
  assert.match(html, /Move every job application forward with confidence/i);
  assert.match(html, /Sign in with ChatGPT/i);
  assert.match(html, /Private by design/i);
});

test("uses direct navigation for the protected dashboard handoff", async () => {
  const landingSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(landingSource, /from "next\/link"/);
  assert.match(landingSource, /<a className="landing-signin" href="\/app">Open dashboard<\/a>/);
  assert.match(landingSource, /chatGPTSignInPath\("\/app"\)/);
});

test("declares portable account, database and file-storage boundaries", async () => {
  const [hostingText, schema, stateRoute, resumeRoute, extractResumeRoute, generateRoute, accountRoute, adminRoute, dashboard, preparationDocx, accountStore, phaseThreeMigration, allowanceMigration, loginAuditMigration] = await Promise.all([
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/resumes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/extract-resume/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/generate-application-material/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/account/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/preparation-docx.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/appliflow-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_free_bucky.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_windy_rawhide_kid.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_colossal_prowler.sql", import.meta.url), "utf8"),
  ]);
  const hosting = JSON.parse(hostingText);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "RESUMES");
  assert.match(schema, /sqliteTable\("users"/);
  assert.match(schema, /sqliteTable\("user_states"/);
  assert.match(schema, /sqliteTable\(\s*"ai_usage"/);
  assert.match(schema, /sqliteTable\(\s*"login_events"/);
  assert.match(schema, /accountStatus: text\("account_status"\)/);
  assert.match(stateRoute, /requestUser\(request\)/);
  assert.match(stateRoute, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(stateRoute, /salary: 200/);
  assert.match(stateRoute, /rejectionComment: 10_000/);
  assert.match(stateRoute, /interviewNotes: 20_000/);
  assert.match(stateRoute, /safe\.stageHistory = stageHistory\.length/);
  assert.match(stateRoute, /schemaVersion: 7/);
  assert.match(stateRoute, /safe\.customTasks/);
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
  assert.match(adminRoute, /adminUserDetail/);
  assert.match(adminRoute, /searchParams\.get\("userId"\)/);
  assert.match(phaseThreeMigration, /ALTER TABLE `users` ADD `account_status`/);
  assert.match(allowanceMigration, /`monthly_allowance` integer DEFAULT 5 NOT NULL/);
  assert.match(allowanceMigration, /SET `monthly_allowance` = 5/);
  assert.match(loginAuditMigration, /CREATE TABLE `login_events`/);
  assert.match(loginAuditMigration, /CREATE INDEX `idx_login_events_user_created`/);
  assert.match(dashboard, /Import my data/);
  assert.match(dashboard, /Delete account data/);
  assert.match(dashboard, /Add to calendar/);
  assert.match(dashboard, /Add reminder task/);
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
  assert.match(dashboard, /AppliFlow does not scrape LinkedIn/);
  assert.match(dashboard, /Export all to Excel/);
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
  assert.match(dashboard, /View details/);
  assert.match(dashboard, /Login information/);
  assert.match(dashboard, /Passwords, IP addresses/);
  assert.match(dashboard, /action:"record-login"/);
  assert.match(dashboard, /\^\[\\s\]\*\[=\+\\-@\]/);
  assert.match(dashboard, /const loggedInIdentity=account\?\?identity/);
  assert.match(dashboard, /view==="overview"\?`Hi, \$\{greetingName\}`/);
  assert.doesNotMatch(dashboard, /profile\.name\|\|account\?\.displayName/);
  assert.match(preparationDocx, /return Packer\.toBlob\(document\)/);
  assert.match(preparationDocx, /style: block\.level === 1 \? "PrepHeading1" : "PrepHeading2"/);
  assert.match(preparationDocx, /bold: true/);
  assert.match(preparationDocx, /format: LevelFormat\.DECIMAL/);
  assert.match(accountStore, /APPLIFLOW_ADMIN_EMAIL/);
  assert.match(accountStore, /identity\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(accountStore, /identity\.displayName, 5, isAdmin/);
  assert.match(accountStore, /creditAudit: auditRows\.results/);
  assert.match(accountStore, /WHERE a\.status = 'succeeded'/);
  assert.match(accountStore, /getUserCreditAudit\(userId: string\)/);
  assert.match(accountStore, /WHERE user_id = \? AND status = 'succeeded'/);
  assert.match(accountStore, /chargeCredit = true/);
  assert.match(accountStore, /kind != 'resume_extract'/);
  assert.match(accountStore, /CREATE TABLE IF NOT EXISTS login_events/);
  assert.match(accountStore, /adminUserDetail/);
  assert.match(accountStore, /datetime\('now', '-5 minutes'\)/);
});
