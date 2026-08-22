import { getD1, getResumeBucket } from ".";

export type Identity = {
  userId: string;
  email: string;
  displayName: string;
};

export type AccountRecord = Identity & {
  plan: string;
  monthlyAllowance: number;
  bonusCredits: number;
  isAdmin: boolean;
  accountStatus: "active" | "suspended";
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
};

export type UsageSummary = {
  used: number;
  allowance: number;
  bonusCredits: number;
  remaining: number;
  resetsAt: string;
};

const STATE_LIMIT_BYTES = 1_800_000;
let schemaPromise: Promise<void> | null = null;

export function isAdminIdentity(identity: Identity) {
  const configuredUserId = process.env.APPLIFLOW_ADMIN_USER_ID?.trim();
  const configuredEmail = process.env.APPLIFLOW_ADMIN_EMAIL?.trim().toLowerCase();
  if (configuredUserId && identity.userId === configuredUserId) return true;
  if (configuredEmail && identity.email.trim().toLowerCase() === configuredEmail) return true;
  return !configuredUserId && !configuredEmail && process.env.NODE_ENV !== "production";
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  const db = getD1();
  schemaPromise = (async () => {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL,
        display_name TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'beta',
        monthly_allowance INTEGER NOT NULL DEFAULT 20,
        bonus_credits INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0,
        account_status TEXT NOT NULL DEFAULT 'active',
        terms_accepted_at TEXT,
        privacy_accepted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS user_states (
        user_id TEXT PRIMARY KEY NOT NULL,
        schema_version INTEGER NOT NULL DEFAULT 1,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS ai_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'started',
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_status_created ON ai_usage(status, created_at)"),
    ]);
    const userColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
    if (!userColumns.results.some((column) => column.name === "account_status")) {
      try {
        await db.prepare("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'").run();
      } catch {
        const currentColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
        if (!currentColumns.results.some((column) => column.name === "account_status")) throw new Error("The account-status migration could not be applied.");
      }
    }
    await db.prepare("PRAGMA optimize").run();
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

export async function ensureUser(identity: Identity): Promise<AccountRecord> {
  await ensureSchema();
  const db = getD1();
  const isAdmin = isAdminIdentity(identity);
  await db.prepare(`INSERT INTO users
      (id, email, display_name, monthly_allowance, is_admin, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE users.is_admin END,
        monthly_allowance = CASE WHEN excluded.is_admin = 1 AND users.monthly_allowance < 200 THEN 200 ELSE users.monthly_allowance END,
        updated_at = CURRENT_TIMESTAMP`)
    .bind(identity.userId, identity.email, identity.displayName, isAdmin ? 200 : 20, isAdmin ? 1 : 0)
    .run();
  return getAccount(identity.userId);
}

export async function getAccount(userId: string): Promise<AccountRecord> {
  await ensureSchema();
  const row = await getD1().prepare(`SELECT id, email, display_name, plan, monthly_allowance,
      bonus_credits, is_admin, account_status, terms_accepted_at, privacy_accepted_at
      FROM users WHERE id = ?`).bind(userId).first<Record<string, unknown>>();
  if (!row) throw new Error("AppliFlow account could not be created.");
  return {
    userId: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    plan: String(row.plan),
    monthlyAllowance: Number(row.monthly_allowance),
    bonusCredits: Number(row.bonus_credits),
    isAdmin: Boolean(row.is_admin),
    accountStatus: row.account_status === "suspended" ? "suspended" : "active",
    termsAcceptedAt: row.terms_accepted_at ? String(row.terms_accepted_at) : null,
    privacyAcceptedAt: row.privacy_accepted_at ? String(row.privacy_accepted_at) : null,
  };
}

export async function getUserState(userId: string) {
  await ensureSchema();
  const row = await getD1().prepare("SELECT state_json, schema_version, updated_at FROM user_states WHERE user_id = ?")
    .bind(userId).first<{ state_json: string; schema_version: number; updated_at: string }>();
  if (!row) return null;
  try {
    return { state: JSON.parse(row.state_json) as unknown, schemaVersion: row.schema_version, updatedAt: row.updated_at };
  } catch {
    throw new Error("Your saved AppliFlow data could not be read.");
  }
}

export async function saveUserState(userId: string, state: unknown) {
  await ensureSchema();
  const stateJson = JSON.stringify(state);
  if (new TextEncoder().encode(stateJson).byteLength > STATE_LIMIT_BYTES) {
    throw new Error("This account has too much draft content to save. Remove older generated drafts and try again.");
  }
  await getD1().prepare(`INSERT INTO user_states (user_id, schema_version, state_json, updated_at)
      VALUES (?, 2, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        schema_version = excluded.schema_version,
        state_json = excluded.state_json,
        updated_at = CURRENT_TIMESTAMP`)
    .bind(userId, stateJson).run();
}

function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  await ensureSchema();
  const account = await getAccount(userId);
  const { start, end } = monthWindow();
  const row = await getD1().prepare(`SELECT COUNT(*) AS used FROM ai_usage
      WHERE user_id = ? AND status = 'succeeded' AND created_at >= ? AND created_at < ?`)
    .bind(userId, start, end).first<{ used: number }>();
  const used = Number(row?.used ?? 0);
  const total = account.monthlyAllowance + account.bonusCredits;
  return {
    used,
    allowance: account.monthlyAllowance,
    bonusCredits: account.bonusCredits,
    remaining: Math.max(0, total - used),
    resetsAt: end,
  };
}

export async function beginGeneration(identity: Identity, kind: string, model: string) {
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") {
    return { allowed: false as const, reason: "suspended" as const, account };
  }
  const usage = await getUsageSummary(identity.userId);
  if (usage.remaining <= 0) return { allowed: false as const, reason: "quota", usage };

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await getD1().prepare(`SELECT COUNT(*) AS count FROM ai_usage
      WHERE user_id = ? AND created_at >= ? AND status IN ('started', 'succeeded')`)
    .bind(identity.userId, minuteAgo).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 4) return { allowed: false as const, reason: "rate", usage };

  const result = await getD1().prepare(`INSERT INTO ai_usage (user_id, kind, model, status)
      VALUES (?, ?, ?, 'started')`).bind(identity.userId, kind, model).run();
  return { allowed: true as const, usageId: Number(result.meta.last_row_id ?? 0), account, usage };
}

export async function finishGeneration(usageId: number, status: "succeeded" | "failed", inputTokens = 0, outputTokens = 0) {
  await ensureSchema();
  await getD1().prepare(`UPDATE ai_usage SET status = ?, input_tokens = ?, output_tokens = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ?`).bind(status, Math.max(0, inputTokens), Math.max(0, outputTokens), usageId).run();
}

export async function acceptPolicies(userId: string) {
  await ensureSchema();
  await getD1().prepare(`UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP,
      privacy_accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(userId).run();
  return getAccount(userId);
}

export async function deleteAccountData(userId: string) {
  await ensureSchema();
  const bucket = getResumeBucket();
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: resumePrefix(userId), cursor });
    if (listed.objects.length) await bucket.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  await getD1().batch([
    getD1().prepare("DELETE FROM ai_usage WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM user_states WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

export function resumePrefix(userId: string) {
  return `users/${encodeURIComponent(userId)}/`;
}

export async function adminSummary(identity: Identity) {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  const db = getD1();
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE account_status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM ai_usage WHERE status = 'succeeded') AS generations,
      (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM ai_usage WHERE status = 'succeeded') AS tokens`)
    .first<{ users: number; suspended: number; generations: number; tokens: number }>();
  const rows = await db.prepare(`SELECT u.id, u.email, u.display_name, u.plan, u.monthly_allowance,
      u.bonus_credits, u.account_status, u.created_at, u.updated_at, COUNT(a.id) AS generations
      FROM users u LEFT JOIN ai_usage a ON a.user_id = u.id AND a.status = 'succeeded'
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`).all<Record<string, unknown>>();
  return {
    totals: { users: Number(totals?.users ?? 0), suspended: Number(totals?.suspended ?? 0), generations: Number(totals?.generations ?? 0), tokens: Number(totals?.tokens ?? 0) },
    users: rows.results.map((row) => ({
      id: String(row.id), email: String(row.email), displayName: String(row.display_name), plan: String(row.plan),
      monthlyAllowance: Number(row.monthly_allowance), bonusCredits: Number(row.bonus_credits),
      accountStatus: row.account_status === "suspended" ? "suspended" : "active",
      generations: Number(row.generations), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    })),
  };
}

export async function grantBonusCredits(identity: Identity, targetUserId: string, amount: number) {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  const safeAmount = Math.max(0, Math.min(500, Math.round(amount)));
  await getD1().prepare(`UPDATE users SET bonus_credits = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(safeAmount, targetUserId).run();
}

export async function setAccountStatus(identity: Identity, targetUserId: string, status: "active" | "suspended") {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  if (targetUserId === identity.userId) throw new Error("You cannot suspend your own administrator account.");
  if (status !== "active" && status !== "suspended") throw new Error("Choose a valid account status.");
  await getD1().prepare(`UPDATE users SET account_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(status, targetUserId).run();
}
