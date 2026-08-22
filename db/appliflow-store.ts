import { getD1, getResumeBucket } from ".";

export type Identity = {
  userId: string;
  email: string;
  displayName: string;
};

export type PlanId = "free" | "basic" | "standard";
export type BillingInterval = "monthly" | "quarterly" | "six_month" | "annual";

export const PLAN_CATALOG = {
  free: { id: "free", name: "Free", allowance: 2, amountCents: 0 },
  basic: { id: "basic", name: "Basic", allowance: 10, amountCents: 1_000 },
  standard: { id: "standard", name: "Standard", allowance: 20, amountCents: 1_500 },
} as const;

export const BILLING_INTERVALS = [
  { id: "monthly", label: "Monthly", checkoutLabel: "one month", months: 1, savingsPercent: 0, amounts: { basic: 1_000, standard: 1_500 } },
  { id: "quarterly", label: "Quarterly", checkoutLabel: "three months", months: 3, savingsPercent: 7, amounts: { basic: 2_800, standard: 4_200 } },
  { id: "six_month", label: "6 months", checkoutLabel: "six months", months: 6, savingsPercent: 10, amounts: { basic: 5_400, standard: 8_100 } },
  { id: "annual", label: "Annually", checkoutLabel: "one year", months: 12, savingsPercent: 20, amounts: { basic: 9_600, standard: 14_400 } },
] as const;

export const EXTRA_CREDIT_PRICE_CENTS = 150;

export function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "basic" || value === "standard";
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "quarterly" || value === "six_month" || value === "annual";
}

function billingIntervalDetails(interval: BillingInterval) {
  return BILLING_INTERVALS.find((option) => option.id === interval) ?? BILLING_INTERVALS[0];
}

function subscriptionProduct(productId: string) {
  for (const plan of ["basic", "standard"] as const) {
    for (const interval of BILLING_INTERVALS) {
      if (productId === `${plan}_${interval.id}`) {
        return { plan, interval, amountCents: interval.amounts[plan] };
      }
    }
  }
  return null;
}

export function hasPaidPlanFeatures(plan: PlanId) {
  return plan === "basic" || plan === "standard";
}

export function paymentMode(): "demo" | "stripe" {
  return process.env.APPLIFLOW_PAYMENT_MODE === "stripe" ? "stripe" : "demo";
}

export type AccountRecord = Identity & {
  plan: PlanId;
  monthlyAllowance: number;
  bonusCredits: number;
  isAdmin: boolean;
  accountStatus: "active" | "suspended";
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  subscriptionStatus: "active" | "canceling" | "free";
  billingInterval: BillingInterval;
  billingPeriodStart: string | null;
  billingPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type UsageSummary = {
  used: number;
  allowanceUsed: number;
  allowance: number;
  bonusCredits: number;
  remaining: number;
  resetsAt: string;
};

export type CreditUsageRecord = {
  id: number;
  kind: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  creditSource: "monthly" | "purchased";
  usedAt: string;
};

export type BillingTransactionRecord = {
  id: number;
  gateway: string;
  reference: string;
  kind: string;
  productId: string;
  plan: PlanId | null;
  credits: number;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

const STATE_LIMIT_BYTES = 1_800_000;
let schemaPromise: Promise<void> | null = null;

function resultChanges(result: D1Result<unknown>) {
  return Number((result.meta as { changes?: number }).changes ?? 0);
}

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
        plan TEXT NOT NULL DEFAULT 'free',
        monthly_allowance INTEGER NOT NULL DEFAULT 2,
        bonus_credits INTEGER NOT NULL DEFAULT 0,
        is_admin INTEGER NOT NULL DEFAULT 0,
        account_status TEXT NOT NULL DEFAULT 'active',
        terms_accepted_at TEXT,
        privacy_accepted_at TEXT,
        subscription_status TEXT NOT NULL DEFAULT 'free',
        billing_interval TEXT NOT NULL DEFAULT 'monthly',
        billing_period_start TEXT,
        billing_period_end TEXT,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        payment_customer_id TEXT,
        payment_subscription_id TEXT,
        plan_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        credit_source TEXT NOT NULL DEFAULT 'monthly',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS login_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS billing_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        user_id TEXT NOT NULL,
        gateway TEXT NOT NULL DEFAULT 'demo',
        gateway_reference TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL,
        product_id TEXT NOT NULL,
        plan TEXT,
        credits INTEGER NOT NULL DEFAULT 0,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'CAD',
        status TEXT NOT NULL DEFAULT 'succeeded',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage(user_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_status_created ON ai_usage(status, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_login_events_user_created ON login_events(user_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_transactions_user_created ON billing_transactions(user_id, created_at)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_billing_transactions_status_created ON billing_transactions(status, created_at)"),
    ]);
    const userColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
    const missingUserColumns = [
      ["account_status", "ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'"],
      ["subscription_status", "ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'free'"],
      ["billing_interval", "ALTER TABLE users ADD COLUMN billing_interval TEXT NOT NULL DEFAULT 'monthly'"],
      ["billing_period_start", "ALTER TABLE users ADD COLUMN billing_period_start TEXT"],
      ["billing_period_end", "ALTER TABLE users ADD COLUMN billing_period_end TEXT"],
      ["cancel_at_period_end", "ALTER TABLE users ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0"],
      ["payment_customer_id", "ALTER TABLE users ADD COLUMN payment_customer_id TEXT"],
      ["payment_subscription_id", "ALTER TABLE users ADD COLUMN payment_subscription_id TEXT"],
      ["plan_updated_at", "ALTER TABLE users ADD COLUMN plan_updated_at TEXT"],
    ] as const;
    for (const [name, statement] of missingUserColumns) {
      if (userColumns.results.some((column) => column.name === name)) continue;
      try {
        await db.prepare(statement).run();
      } catch {
        const currentColumns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
        if (!currentColumns.results.some((column) => column.name === name)) throw new Error(`The ${name} migration could not be applied.`);
      }
    }
    const usageColumns = await db.prepare("PRAGMA table_info(ai_usage)").all<{ name: string }>();
    if (!usageColumns.results.some((column) => column.name === "credit_source")) {
      await db.prepare("ALTER TABLE ai_usage ADD COLUMN credit_source TEXT NOT NULL DEFAULT 'monthly'").run();
    }
    await db.prepare(`UPDATE users SET plan = 'free', monthly_allowance = 2,
        subscription_status = 'free', updated_at = CURRENT_TIMESTAMP WHERE plan = 'beta'`).run();
    await db.prepare("UPDATE users SET plan_updated_at = COALESCE(plan_updated_at, updated_at, CURRENT_TIMESTAMP)").run();
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
      (id, email, display_name, plan, monthly_allowance, subscription_status, is_admin, updated_at)
      VALUES (?, ?, ?, 'free', ?, 'free', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        is_admin = CASE WHEN excluded.is_admin = 1 THEN 1 ELSE users.is_admin END,
        updated_at = CURRENT_TIMESTAMP`)
    .bind(identity.userId, identity.email, identity.displayName, PLAN_CATALOG.free.allowance, isAdmin ? 1 : 0)
    .run();
  return getAccount(identity.userId);
}

export async function getAccount(userId: string): Promise<AccountRecord> {
  await ensureSchema();
  const db = getD1();
  const row = await db.prepare(`SELECT id, email, display_name, plan, monthly_allowance,
      bonus_credits, is_admin, account_status, terms_accepted_at, privacy_accepted_at,
      subscription_status, billing_interval, billing_period_start, billing_period_end, cancel_at_period_end
      FROM users WHERE id = ?`).bind(userId).first<Record<string, unknown>>();
  if (!row) throw new Error("AppliFlow account could not be created.");
  const rawPlan = isPlanId(row.plan) ? row.plan : "free";
  const billingInterval = isBillingInterval(row.billing_interval) ? row.billing_interval : "monthly";
  const periodEnd = row.billing_period_end ? databaseTimestamp(row.billing_period_end) : null;
  if (rawPlan !== "free" && periodEnd && Date.parse(periodEnd) <= Date.now()) {
    if (Number(row.cancel_at_period_end) === 1) {
      await db.prepare(`UPDATE users SET plan = 'free', monthly_allowance = ?, subscription_status = 'free',
          billing_interval = 'monthly', billing_period_start = NULL, billing_period_end = NULL, cancel_at_period_end = 0,
          payment_subscription_id = NULL, plan_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`).bind(PLAN_CATALOG.free.allowance, userId).run();
      return getAccount(userId);
    }
    if (paymentMode() === "demo") {
      let nextStart = new Date(periodEnd);
      let nextEnd = addUtcMonths(nextStart, billingIntervalDetails(billingInterval).months);
      while (nextEnd.getTime() <= Date.now()) {
        nextStart = nextEnd;
        nextEnd = addUtcMonths(nextStart, billingIntervalDetails(billingInterval).months);
      }
      const renewalReference = `demo-renewal:${userId}:${nextStart.toISOString()}`;
      const renewal = subscriptionProduct(`${rawPlan}_${billingInterval}`);
      if (!renewal) throw new Error("The subscription renewal schedule is invalid.");
      await db.batch([
        db.prepare(`UPDATE users SET billing_period_start = ?, billing_period_end = ?,
          subscription_status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(nextStart.toISOString(), nextEnd.toISOString(), userId),
        db.prepare(`INSERT OR IGNORE INTO billing_transactions
          (user_id, gateway, gateway_reference, kind, product_id, plan, credits, amount_cents, currency, status)
          VALUES (?, 'demo', ?, 'subscription_renewal', ?, ?, 0, ?, 'CAD', 'succeeded')`)
          .bind(userId, renewalReference, `${rawPlan}_${billingInterval}`, rawPlan, renewal.amountCents),
      ]);
      return getAccount(userId);
    }
  }
  return {
    userId: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    plan: rawPlan,
    monthlyAllowance: Number(row.monthly_allowance),
    bonusCredits: Number(row.bonus_credits),
    isAdmin: Number(row.is_admin) === 1,
    accountStatus: row.account_status === "suspended" ? "suspended" : "active",
    termsAcceptedAt: row.terms_accepted_at ? String(row.terms_accepted_at) : null,
    privacyAcceptedAt: row.privacy_accepted_at ? String(row.privacy_accepted_at) : null,
    subscriptionStatus: rawPlan === "free" ? "free" : Number(row.cancel_at_period_end) === 1 ? "canceling" : "active",
    billingInterval,
    billingPeriodStart: row.billing_period_start ? databaseTimestamp(row.billing_period_start) : null,
    billingPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
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
      VALUES (?, 4, ?, CURRENT_TIMESTAMP)
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

function addUtcMonths(value: Date, months: number) {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function usageWindow(account: AccountRecord) {
  if (account.plan !== "free" && account.billingPeriodStart && account.billingPeriodEnd) {
    const subscriptionEnd = new Date(account.billingPeriodEnd);
    let start = new Date(account.billingPeriodStart);
    let end = addUtcMonths(start, 1);
    while (end.getTime() <= Date.now() && end.getTime() < subscriptionEnd.getTime()) {
      start = end;
      end = addUtcMonths(start, 1);
    }
    if (end.getTime() > subscriptionEnd.getTime()) end = subscriptionEnd;
    return { start: start.toISOString(), end: end.toISOString() };
  }
  return monthWindow();
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  await ensureSchema();
  const account = await getAccount(userId);
  const { start, end } = usageWindow(account);
  const row = await getD1().prepare(`SELECT COUNT(*) AS used,
      SUM(CASE WHEN credit_source = 'monthly' THEN 1 ELSE 0 END) AS allowance_used
      FROM ai_usage
      WHERE user_id = ? AND status = 'succeeded' AND kind != 'resume_extract'
        AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`)
    .bind(userId, start, end).first<{ used: number; allowance_used: number }>();
  const used = Number(row?.used ?? 0);
  const allowanceUsed = Number(row?.allowance_used ?? 0);
  return {
    used,
    allowanceUsed,
    allowance: account.monthlyAllowance,
    bonusCredits: account.bonusCredits,
    remaining: Math.max(0, account.monthlyAllowance - allowanceUsed) + account.bonusCredits,
    resetsAt: end,
  };
}

function databaseTimestamp(value: unknown) {
  const timestamp = String(value ?? "");
  return timestamp.includes("T") ? timestamp : `${timestamp.replace(" ", "T")}Z`;
}

export async function getUserCreditAudit(userId: string): Promise<CreditUsageRecord[]> {
  await ensureSchema();
  const rows = await getD1().prepare(`SELECT id, kind, model, input_tokens, output_tokens, credit_source,
      COALESCE(finished_at, created_at) AS used_at
      FROM ai_usage
      WHERE user_id = ? AND status = 'succeeded' AND kind != 'resume_extract'
      ORDER BY COALESCE(finished_at, created_at) DESC LIMIT 200`)
    .bind(userId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: Number(row.id), kind: String(row.kind), model: String(row.model),
    inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens),
    creditSource: row.credit_source === "purchased" ? "purchased" : "monthly",
    usedAt: databaseTimestamp(row.used_at),
  }));
}

export async function recordLoginEvent(userId: string, userAgent: string) {
  await ensureSchema();
  const safeUserAgent = userAgent.slice(0, 500) || "Unknown browser";
  const recent = await getD1().prepare(`SELECT id FROM login_events
      WHERE user_id = ? AND user_agent = ? AND created_at >= datetime('now', '-5 minutes')
      ORDER BY created_at DESC LIMIT 1`)
    .bind(userId, safeUserAgent).first<{ id: number }>();
  if (recent) return false;
  await getD1().prepare("INSERT INTO login_events (user_id, user_agent) VALUES (?, ?)")
    .bind(userId, safeUserAgent).run();
  return true;
}

export async function beginGeneration(identity: Identity, kind: string, model: string, chargeCredit = true) {
  let account = await ensureUser(identity);
  if (account.accountStatus === "suspended") {
    return { allowed: false as const, reason: "suspended" as const, account };
  }
  const db = getD1();
  const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const stalePurchased = await db.prepare(`SELECT COUNT(*) AS count FROM ai_usage
      WHERE user_id = ? AND status = 'started' AND credit_source = 'purchased' AND datetime(created_at) < datetime(?)`)
    .bind(identity.userId, staleCutoff).first<{ count: number }>();
  const staleCount = Number(stalePurchased?.count ?? 0);
  if (staleCount > 0) {
    await db.batch([
      db.prepare("UPDATE users SET bonus_credits = bonus_credits + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(staleCount, identity.userId),
      db.prepare(`UPDATE ai_usage SET status = 'failed', finished_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND status = 'started' AND datetime(created_at) < datetime(?)`).bind(identity.userId, staleCutoff),
    ]);
    account = await getAccount(identity.userId);
  } else {
    await db.prepare(`UPDATE ai_usage SET status = 'failed', finished_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND status = 'started' AND datetime(created_at) < datetime(?)`).bind(identity.userId, staleCutoff).run();
  }
  const usage = await getUsageSummary(identity.userId);
  if (chargeCredit && usage.remaining <= 0) return { allowed: false as const, reason: "quota", usage };

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await db.prepare(`SELECT COUNT(*) AS count FROM ai_usage
      WHERE user_id = ? AND datetime(created_at) >= datetime(?) AND status IN ('started', 'succeeded')`)
    .bind(identity.userId, minuteAgo).first<{ count: number }>();
  if (Number(recent?.count ?? 0) >= 4) return { allowed: false as const, reason: "rate", usage };

  let creditSource = "none";
  if (chargeCredit) {
    const { start, end } = usageWindow(account);
    const reserved = await db.prepare(`SELECT COUNT(*) AS count FROM ai_usage
        WHERE user_id = ? AND kind != 'resume_extract' AND credit_source = 'monthly'
          AND status IN ('started', 'succeeded') AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?)`)
      .bind(identity.userId, start, end).first<{ count: number }>();
    creditSource = Number(reserved?.count ?? 0) < account.monthlyAllowance ? "monthly" : "purchased";
  }

  let result: D1Result<unknown>;
  if (creditSource === "purchased") {
    const results = await db.batch([
      db.prepare(`UPDATE users SET bonus_credits = bonus_credits - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND bonus_credits > 0`).bind(identity.userId),
      db.prepare(`INSERT INTO ai_usage (user_id, kind, model, status, credit_source)
        VALUES (?, ?, ?, 'started', 'purchased')`).bind(identity.userId, kind, model),
    ]);
    if (resultChanges(results[0]) < 1) {
      await db.prepare(`UPDATE ai_usage SET status = 'failed', finished_at = CURRENT_TIMESTAMP
        WHERE id = ?`).bind(Number(results[1].meta.last_row_id ?? 0)).run();
      return { allowed: false as const, reason: "quota", usage };
    }
    result = results[1];
  } else {
    result = await db.prepare(`INSERT INTO ai_usage (user_id, kind, model, status, credit_source)
      VALUES (?, ?, ?, 'started', ?)`).bind(identity.userId, kind, model, creditSource).run();
  }
  return { allowed: true as const, usageId: Number(result.meta.last_row_id ?? 0), account, usage };
}

export async function finishGeneration(usageId: number, status: "succeeded" | "failed", inputTokens = 0, outputTokens = 0) {
  await ensureSchema();
  const db = getD1();
  const usage = await db.prepare("SELECT user_id, status, credit_source FROM ai_usage WHERE id = ?")
    .bind(usageId).first<{ user_id: string; status: string; credit_source: string }>();
  if (!usage || usage.status !== "started") return;
  const update = db.prepare(`UPDATE ai_usage SET status = ?, input_tokens = ?, output_tokens = ?, finished_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'started'`).bind(status, Math.max(0, inputTokens), Math.max(0, outputTokens), usageId);
  if (status === "failed" && usage.credit_source === "purchased") {
    await db.batch([
      update,
      db.prepare("UPDATE users SET bonus_credits = bonus_credits + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(usage.user_id),
    ]);
  } else {
    await update.run();
  }
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
    getD1().prepare("DELETE FROM billing_transactions WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM login_events WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM ai_usage WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM user_states WHERE user_id = ?").bind(userId),
    getD1().prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}

export function resumePrefix(userId: string) {
  return `users/${encodeURIComponent(userId)}/`;
}

function billingTransaction(row: Record<string, unknown>): BillingTransactionRecord {
  return {
    id: Number(row.id), gateway: String(row.gateway), reference: String(row.gateway_reference),
    kind: String(row.kind), productId: String(row.product_id), plan: isPlanId(row.plan) ? row.plan : null,
    credits: Number(row.credits), amountCents: Number(row.amount_cents), currency: String(row.currency),
    status: String(row.status), createdAt: databaseTimestamp(row.created_at),
  };
}

export async function getBillingTransactions(userId: string, limit = 100) {
  await ensureSchema();
  const rows = await getD1().prepare(`SELECT id, gateway, gateway_reference, kind, product_id, plan,
      credits, amount_cents, currency, status, created_at FROM billing_transactions
      WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(userId, Math.max(1, Math.min(200, Math.round(limit)))).all<Record<string, unknown>>();
  return rows.results.map(billingTransaction);
}

export async function getBillingSummary(identity: Identity) {
  const account = await ensureUser(identity);
  const [usage, transactions] = await Promise.all([
    getUsageSummary(identity.userId),
    getBillingTransactions(identity.userId),
  ]);
  return {
    mode: paymentMode(),
    account,
    usage,
    transactions,
    plans: Object.values(PLAN_CATALOG),
    billingIntervals: BILLING_INTERVALS,
    extraCreditPriceCents: EXTRA_CREDIT_PRICE_CENTS,
    sandboxCreditLimit: 20,
  };
}

function safeReference(gateway: string, identity: Identity, requestId: string) {
  const cleaned = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  if (cleaned.length < 8) throw new Error("The checkout request is invalid. Refresh and try again.");
  return `${gateway}:${identity.userId}:${cleaned}`;
}

function nextBillingPeriod(interval: BillingInterval) {
  const start = new Date();
  const end = addUtcMonths(start, billingIntervalDetails(interval).months);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function completeDemoCheckout(identity: Identity, productId: string, quantity: number, requestId: string) {
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") throw new Error("This account is suspended.");
  if (paymentMode() !== "demo") throw new Error("Sandbox checkout is disabled for this deployment.");
  const demoKey = process.env.APPLIFLOW_DEMO_PAYMENT_KEY?.trim() || "appliflow-demo-checkout-v1";
  if (!demoKey.startsWith("appliflow-demo-")) throw new Error("The sandbox payment gateway is not configured correctly.");
  const reference = safeReference("demo", identity, requestId);
  const existing = await getD1().prepare("SELECT id FROM billing_transactions WHERE gateway_reference = ?")
    .bind(reference).first<{ id: number }>();
  if (existing) return getBillingSummary(identity);

  const db = getD1();
  const subscription = subscriptionProduct(productId);
  if (subscription) {
    const { plan, interval, amountCents } = subscription;
    const product = PLAN_CATALOG[plan];
    const inserted = await db.prepare(`INSERT OR IGNORE INTO billing_transactions
        (user_id, gateway, gateway_reference, kind, product_id, plan, credits, amount_cents, currency, status)
        VALUES (?, 'demo', ?, 'subscription_purchase', ?, ?, 0, ?, 'CAD', 'succeeded')`)
      .bind(identity.userId, reference, productId, plan, amountCents).run();
    if (resultChanges(inserted) > 0) {
      const period = nextBillingPeriod(interval.id);
      await db.prepare(`UPDATE users SET plan = ?, monthly_allowance = ?, subscription_status = 'active',
          billing_interval = ?, billing_period_start = ?, billing_period_end = ?, cancel_at_period_end = 0,
          payment_customer_id = COALESCE(payment_customer_id, ?), payment_subscription_id = ?,
          plan_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .bind(plan, product.allowance, interval.id, period.start, period.end, `demo_customer_${identity.userId}`, `demo_subscription_${identity.userId}`, identity.userId).run();
    }
    return getBillingSummary(identity);
  }

  if (productId === "extra_credits") {
    const safeQuantity = Math.max(1, Math.min(20, Math.round(quantity)));
    if (account.bonusCredits + safeQuantity > 20) {
      throw new Error("Sandbox accounts can hold up to 20 purchased credits at a time. Use some credits before adding more.");
    }
    const amountCents = safeQuantity * EXTRA_CREDIT_PRICE_CENTS;
    const inserted = await db.prepare(`INSERT OR IGNORE INTO billing_transactions
        (user_id, gateway, gateway_reference, kind, product_id, plan, credits, amount_cents, currency, status)
        VALUES (?, 'demo', ?, 'credit_purchase', 'extra_credits', NULL, ?, ?, 'CAD', 'succeeded')`)
      .bind(identity.userId, reference, safeQuantity, amountCents).run();
    if (resultChanges(inserted) > 0) {
      await db.prepare("UPDATE users SET bonus_credits = bonus_credits + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(safeQuantity, identity.userId).run();
    }
    return getBillingSummary(identity);
  }
  throw new Error("Choose a valid AppliFlow plan or credit purchase.");
}

export async function scheduleSubscriptionCancellation(identity: Identity, requestId: string) {
  const account = await ensureUser(identity);
  if (account.plan === "free") throw new Error("The Free plan has no subscription to cancel.");
  if (account.cancelAtPeriodEnd) return getBillingSummary(identity);
  const reference = safeReference(paymentMode(), identity, requestId);
  const db = getD1();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO billing_transactions
      (user_id, gateway, gateway_reference, kind, product_id, plan, credits, amount_cents, currency, status)
      VALUES (?, ?, ?, 'subscription_cancel', ?, ?, 0, 0, 'CAD', 'succeeded')`)
    .bind(identity.userId, paymentMode(), reference, `${account.plan}_${account.billingInterval}`, account.plan).run();
  if (resultChanges(inserted) > 0) {
    await db.prepare(`UPDATE users SET cancel_at_period_end = 1, subscription_status = 'canceling',
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(identity.userId).run();
  }
  return getBillingSummary(identity);
}

export async function resumeSubscription(identity: Identity, requestId: string) {
  const account = await ensureUser(identity);
  if (account.plan === "free" || !account.cancelAtPeriodEnd) return getBillingSummary(identity);
  const reference = safeReference(paymentMode(), identity, requestId);
  const db = getD1();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO billing_transactions
      (user_id, gateway, gateway_reference, kind, product_id, plan, credits, amount_cents, currency, status)
      VALUES (?, ?, ?, 'subscription_resume', ?, ?, 0, 0, 'CAD', 'succeeded')`)
    .bind(identity.userId, paymentMode(), reference, `${account.plan}_${account.billingInterval}`, account.plan).run();
  if (resultChanges(inserted) > 0) {
    await db.prepare(`UPDATE users SET cancel_at_period_end = 0, subscription_status = 'active',
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(identity.userId).run();
  }
  return getBillingSummary(identity);
}

export async function adminSummary(identity: Identity) {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  const db = getD1();
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE account_status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM users WHERE plan IN ('basic', 'standard')) AS paid_subscribers,
      (SELECT COUNT(*) FROM ai_usage WHERE status = 'succeeded' AND kind != 'resume_extract') AS generations,
      (SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM ai_usage
        WHERE status = 'succeeded' AND kind != 'resume_extract') AS tokens,
      (SELECT COALESCE(SUM(amount_cents), 0) FROM billing_transactions
        WHERE status = 'succeeded' AND amount_cents > 0) AS sandbox_revenue_cents`)
    .first<{ users: number; suspended: number; paid_subscribers: number; generations: number; tokens: number; sandbox_revenue_cents: number }>();
  const rows = await db.prepare(`SELECT u.id, u.email, u.display_name, u.plan, u.monthly_allowance,
      u.bonus_credits, u.account_status, u.subscription_status, u.billing_interval, u.billing_period_end,
      u.cancel_at_period_end, u.created_at, u.updated_at, COUNT(a.id) AS generations,
      (SELECT COUNT(*) FROM login_events l WHERE l.user_id = u.id) AS login_count,
      (SELECT MAX(l.created_at) FROM login_events l WHERE l.user_id = u.id) AS last_login_at
      FROM users u LEFT JOIN ai_usage a ON a.user_id = u.id AND a.status = 'succeeded' AND a.kind != 'resume_extract'
      GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`).all<Record<string, unknown>>();
  const auditRows = await db.prepare(`SELECT a.id, a.kind, a.model, a.input_tokens, a.output_tokens,
      a.credit_source, COALESCE(a.finished_at, a.created_at) AS used_at, u.email, u.display_name
      FROM ai_usage a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'succeeded' AND a.kind != 'resume_extract'
      ORDER BY COALESCE(a.finished_at, a.created_at) DESC LIMIT 200`).all<Record<string, unknown>>();
  const paymentRows = await db.prepare(`SELECT b.id, b.gateway, b.gateway_reference, b.kind, b.product_id,
      b.plan, b.credits, b.amount_cents, b.currency, b.status, b.created_at, u.email, u.display_name
      FROM billing_transactions b JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC LIMIT 200`).all<Record<string, unknown>>();
  return {
    totals: { users: Number(totals?.users ?? 0), suspended: Number(totals?.suspended ?? 0),
      paidSubscribers: Number(totals?.paid_subscribers ?? 0), generations: Number(totals?.generations ?? 0),
      tokens: Number(totals?.tokens ?? 0), sandboxRevenueCents: Number(totals?.sandbox_revenue_cents ?? 0) },
    users: rows.results.map((row) => ({
      id: String(row.id), email: String(row.email), displayName: String(row.display_name), plan: String(row.plan),
      monthlyAllowance: Number(row.monthly_allowance), bonusCredits: Number(row.bonus_credits),
      accountStatus: row.account_status === "suspended" ? "suspended" : "active",
      subscriptionStatus: String(row.subscription_status),
      billingInterval: isBillingInterval(row.billing_interval) ? row.billing_interval : "monthly",
      billingPeriodEnd: row.billing_period_end ? databaseTimestamp(row.billing_period_end) : null,
      cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
      generations: Number(row.generations), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      loginCount: Number(row.login_count), lastLoginAt: row.last_login_at ? databaseTimestamp(row.last_login_at) : null,
    })),
    creditAudit: auditRows.results.map((row) => ({
      id: Number(row.id), kind: String(row.kind), model: String(row.model),
      inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens), usedAt: databaseTimestamp(row.used_at),
      creditSource: row.credit_source === "purchased" ? "purchased" : "monthly",
      email: String(row.email), displayName: String(row.display_name),
    })),
    paymentAudit: paymentRows.results.map((row) => ({
      ...billingTransaction(row), email: String(row.email), displayName: String(row.display_name),
    })),
  };
}

export async function adminUserDetail(identity: Identity, targetUserId: string) {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  const db = getD1();
  const row = await db.prepare(`SELECT id, email, display_name, plan, monthly_allowance, bonus_credits,
      account_status, subscription_status, billing_interval, billing_period_start, billing_period_end, cancel_at_period_end,
      created_at, updated_at,
      (SELECT COUNT(*) FROM ai_usage a WHERE a.user_id = users.id
        AND a.status = 'succeeded' AND a.kind != 'resume_extract') AS generations,
      (SELECT MAX(l.created_at) FROM login_events l WHERE l.user_id = users.id) AS last_login_at
      FROM users WHERE id = ?`).bind(targetUserId).first<Record<string, unknown>>();
  if (!row) throw new Error("User not found.");
  const [creditAudit, loginRows, payments] = await Promise.all([
    getUserCreditAudit(targetUserId),
    db.prepare(`SELECT id, user_agent, created_at FROM login_events
        WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(targetUserId).all<Record<string, unknown>>(),
    getBillingTransactions(targetUserId),
  ]);
  return {
    user: {
      id: String(row.id), email: String(row.email), displayName: String(row.display_name), plan: String(row.plan),
      monthlyAllowance: Number(row.monthly_allowance), bonusCredits: Number(row.bonus_credits),
      accountStatus: row.account_status === "suspended" ? "suspended" : "active",
      subscriptionStatus: String(row.subscription_status),
      billingInterval: isBillingInterval(row.billing_interval) ? row.billing_interval : "monthly",
      billingPeriodStart: row.billing_period_start ? databaseTimestamp(row.billing_period_start) : null,
      billingPeriodEnd: row.billing_period_end ? databaseTimestamp(row.billing_period_end) : null,
      cancelAtPeriodEnd: Number(row.cancel_at_period_end) === 1,
      generations: Number(row.generations), createdAt: databaseTimestamp(row.created_at), updatedAt: databaseTimestamp(row.updated_at),
      lastLoginAt: row.last_login_at ? databaseTimestamp(row.last_login_at) : null,
    },
    creditAudit,
    payments,
    loginEvents: loginRows.results.map((login) => ({
      id: Number(login.id), userAgent: String(login.user_agent), loggedInAt: databaseTimestamp(login.created_at),
    })),
  };
}

export async function setMonthlyAllowance(identity: Identity, targetUserId: string, amount: number) {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  const safeAmount = Math.max(0, Math.min(500, Math.round(amount)));
  const reference = `admin:${identity.userId}:${crypto.randomUUID()}`;
  await getD1().batch([
    getD1().prepare(`UPDATE users SET monthly_allowance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(safeAmount, targetUserId),
    getD1().prepare(`INSERT INTO billing_transactions
      (user_id, gateway, gateway_reference, kind, product_id, credits, amount_cents, currency, status)
      VALUES (?, 'admin', ?, 'allowance_adjustment', ?, 0, 0, 'CAD', 'succeeded')`)
      .bind(targetUserId, reference, `monthly_limit_${safeAmount}`),
  ]);
}

export async function setAccountStatus(identity: Identity, targetUserId: string, status: "active" | "suspended") {
  const account = await ensureUser(identity);
  if (!account.isAdmin) throw new Error("Administrator access is required.");
  if (targetUserId === identity.userId) throw new Error("You cannot suspend your own administrator account.");
  if (status !== "active" && status !== "suspended") throw new Error("Choose a valid account status.");
  await getD1().prepare(`UPDATE users SET account_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(status, targetUserId).run();
}
