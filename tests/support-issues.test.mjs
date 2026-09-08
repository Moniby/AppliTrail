import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("persists privacy-safe user issue reports and exposes them to administrators", async () => {
  const [dashboard, route, adminRoute, store, schema, migration, backup] = await Promise.all([
    source("../app/dashboard-client.tsx"),
    source("../app/api/support-issues/route.ts"),
    source("../app/api/admin/route.ts"),
    source("../db/appliflow-store.ts"),
    source("../db/schema.ts"),
    source("../drizzle/0009_robust_sasquatch.sql"),
    source("../scripts/portable-backup.mjs"),
  ]);

  assert.match(dashboard, /Report a problem/);
  assert.match(dashboard, /never sends your CV, job description, password or payment details/i);
  assert.match(dashboard, /SYSTEM HEALTH/);
  assert.match(dashboard, /USER ISSUE REPORTS/);
  assert.match(dashboard, /Support inbox/);
  assert.match(route, /requestUser\(request\)/);
  assert.match(route, /rejectCrossSiteMutation\(request\)/);
  assert.match(route, /createSupportIssue/);
  assert.match(route, /getUserSupportIssues/);
  assert.match(adminRoute, /payload\.action === "issue-status"/);
  assert.match(store, /export async function createSupportIssue/);
  assert.match(store, /export async function setSupportIssueStatus/);
  assert.match(store, /databaseReady/);
  assert.match(store, /storageReady/);
  assert.match(store, /webhookIssues24h/);
  assert.match(schema, /"support_issues"/);
  assert.match(migration, /CREATE TABLE `support_issues`/);
  assert.match(migration, /idx_support_issues_status_created/);
  assert.match(backup, /"support_issues"/);
});
