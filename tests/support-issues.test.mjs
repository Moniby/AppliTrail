import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("persists privacy-safe user issue reports and exposes them to administrators", async () => {
  const [dashboard, styles, route, adminRoute, adminAuditRoute, store, schema, migration, replyMigration, backup] = await Promise.all([
    source("../app/dashboard-client.tsx"),
    source("../app/globals.css"),
    source("../app/api/support-issues/route.ts"),
    source("../app/api/admin/route.ts"),
    source("../app/api/admin/audit/route.ts"),
    source("../db/appliflow-store.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0009_robust_sasquatch.sql"),
    source("../drizzle/0010_damp_scarlet_witch.sql"),
    source("../scripts/portable-backup.mjs"),
  ]);

  assert.match(dashboard, /Report a problem/);
  assert.match(dashboard, /never sends your CV, job description, password or payment details/i);
  assert.match(dashboard, /SYSTEM HEALTH/);
  assert.match(dashboard, /USER ISSUE REPORTS/);
  assert.match(dashboard, /Support inbox/);
  assert.match(dashboard, /Your problem reports/);
  assert.match(dashboard, /Send reply/);
  assert.match(dashboard, /Admin dashboard sections/);
  assert.match(dashboard, /Search credit audit/);
  assert.match(dashboard, /Search payment audit/);
  assert.match(dashboard, /AdminCreditAuditPanel/);
  assert.match(dashboard, /AdminPaymentAuditPanel/);
  assert.match(dashboard, /ADMINISTRATOR ALERTS/);
  assert.match(dashboard, /Export CSV/);
  assert.match(dashboard, /type="date"/);
  assert.match(styles, /admin-section-nav/);
  assert.match(styles, /admin-audit-search/);
  assert.match(styles, /admin-audit-pagination/);
  assert.match(styles, /admin-alert-list/);
  assert.match(route, /requestUser\(request\)/);
  assert.match(route, /rejectCrossSiteMutation\(request\)/);
  assert.match(route, /createSupportIssue/);
  assert.match(route, /getUserSupportIssues/);
  assert.match(adminRoute, /payload\.action === "issue-status"/);
  assert.match(adminRoute, /payload\.action === "issue-reply"/);
  assert.match(adminAuditRoute, /adminAudit/);
  assert.match(adminAuditRoute, /text\/csv/);
  assert.match(adminAuditRoute, /Content-Disposition/);
  assert.match(store, /export async function createSupportIssue/);
  assert.match(store, /export async function setSupportIssueStatus/);
  assert.match(store, /export async function replyToSupportIssue/);
  assert.match(store, /RESEND_API_KEY/);
  assert.match(store, /SUPPORT_ADMIN_EMAIL/);
  assert.match(store, /export async function adminAudit/);
  assert.match(store, /emailReady/);
  assert.match(store, /databaseReady/);
  assert.match(store, /storageReady/);
  assert.match(store, /webhookIssues24h/);
  assert.match(schema, /"support_issues"/);
  assert.match(migration, /CREATE TABLE `support_issues`/);
  assert.match(migration, /idx_support_issues_status_created/);
  assert.match(replyMigration, /admin_reply/);
  assert.match(replyMigration, /email_status/);
  assert.match(backup, /"support_issues"/);
});
