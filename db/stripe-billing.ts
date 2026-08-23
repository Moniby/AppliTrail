import {
  BILLING_INTERVALS,
  EXTRA_CREDIT_PRICE_CENTS,
  PLAN_CATALOG,
  type Identity,
  getAppSetting,
  getStripeLinkage,
  paymentMode,
  processStripeWebhookEvent,
  saveAppSetting,
  saveStripeCustomer,
  subscriptionProduct,
} from "./appliflow-store";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-02-25.clover";

type StripeResponse = Record<string, unknown> & { id?: string; url?: string };
type StripeCatalog = {
  accountId: string;
  products: { basic: string; standard: string; extraCredits: string };
  prices: Record<string, string>;
};

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe test payments are not configured yet.");
  if (process.env.STRIPE_ENVIRONMENT !== "live" && !/^[sr]k_test_/.test(key)) {
    throw new Error("Stripe test mode requires a Stripe test secret key.");
  }
  return key;
}

function isStripeCustomerId(value: string | null): value is string {
  return Boolean(value?.startsWith("cus_"));
}

function isStripeSubscriptionId(value: string | null): value is string {
  return Boolean(value?.startsWith("sub_"));
}

function cleanRequestId(requestId: string) {
  const cleaned = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100);
  if (cleaned.length < 8) throw new Error("The checkout request is invalid. Refresh and try again.");
  return cleaned;
}

async function stripeRequest(path: string, values: Record<string, string>, idempotencyKey?: string) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 255) } : {}),
    },
    body: new URLSearchParams(values),
  });
  const body = await response.json().catch(() => ({})) as StripeResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Stripe could not complete this request.");
  return body;
}

async function stripeRetrieve(path: string) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Stripe-Version": STRIPE_API_VERSION,
    },
  });
  const body = await response.json().catch(() => ({})) as StripeResponse & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Stripe could not complete this request.");
  return body;
}

function stripeObjectId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    return String((value as { id?: unknown }).id ?? "");
  }
  return "";
}

function checkoutUserId(session: StripeResponse) {
  const metadata = session.metadata && typeof session.metadata === "object"
    ? session.metadata as Record<string, unknown> : {};
  return String(metadata.user_id ?? session.client_reference_id ?? "").trim();
}

function subscriptionSyncMarker(subscription: StripeResponse) {
  const items = subscription.items && typeof subscription.items === "object"
    ? (subscription.items as { data?: Array<Record<string, unknown>> }).data : undefined;
  const firstItem = items?.[0];
  return [
    stripeObjectId(subscription.id),
    String(subscription.status ?? "unknown"),
    subscription.cancel_at_period_end === true ? "canceling" : "renewing",
    String(subscription.current_period_end ?? firstItem?.current_period_end ?? "no-period"),
    stripeObjectId(firstItem?.price),
  ].join("_").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 220);
}

async function reconcileStripeSession(identity: Identity, session: StripeResponse) {
  const sessionId = stripeObjectId(session.id);
  if (!sessionId.startsWith("cs_")) throw new Error("Stripe returned an invalid checkout session.");
  if (checkoutUserId(session) !== identity.userId) {
    throw new Error("This Stripe checkout does not belong to the signed-in AppliTrail account.");
  }
  if (String(session.status ?? "") !== "complete"
      || !["paid", "no_payment_required"].includes(String(session.payment_status ?? ""))) {
    throw new Error("Stripe has not confirmed this checkout as paid.");
  }
  await processStripeWebhookEvent({
    id: `reconcile_checkout_${sessionId}`,
    type: "checkout.session.completed",
    data: { object: session },
  });
  const subscriptionId = stripeObjectId(session.subscription);
  if (!subscriptionId.startsWith("sub_")) return;
  const subscription = session.subscription && typeof session.subscription === "object"
    ? session.subscription as StripeResponse
    : await stripeRetrieve(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  await processStripeWebhookEvent({
    id: `reconcile_subscription_${subscriptionSyncMarker(subscription)}`,
    type: "customer.subscription.updated",
    data: { object: subscription },
  });
}

export async function reconcileStripeCheckout(identity: Identity, sessionId: string) {
  const cleaned = sessionId.trim();
  if (!/^cs_[A-Za-z0-9_]+$/.test(cleaned)) throw new Error("The Stripe checkout reference is invalid.");
  const session = await stripeRetrieve(`/checkout/sessions/${encodeURIComponent(cleaned)}?expand%5B%5D=subscription`);
  await reconcileStripeSession(identity, session);
}

export async function syncStripeBilling(identity: Identity) {
  const linkage = await getStripeLinkage(identity);
  if (isStripeSubscriptionId(linkage.subscriptionId)) {
    const subscription = await stripeRetrieve(`/subscriptions/${encodeURIComponent(linkage.subscriptionId)}`);
    await processStripeWebhookEvent({
      id: `sync_subscription_${subscriptionSyncMarker(subscription)}`,
      type: "customer.subscription.updated",
      data: { object: subscription },
    });
    return;
  }
  if (!isStripeCustomerId(linkage.customerId)) return;
  const sessions = await stripeRetrieve(`/checkout/sessions?customer=${encodeURIComponent(linkage.customerId)}&status=complete&limit=10`);
  const latest = sessions.data && Array.isArray(sessions.data)
    ? sessions.data.find((session) => session && typeof session === "object"
        && String((session as StripeResponse).mode ?? "") === "subscription")
    : null;
  if (latest && typeof latest === "object") await reconcileStripeSession(identity, latest as StripeResponse);
}

function priceEnvironmentName(productId: string) {
  const names: Record<string, string> = {
    basic_monthly: "STRIPE_PRICE_BASIC_MONTHLY",
    basic_quarterly: "STRIPE_PRICE_BASIC_QUARTERLY",
    basic_six_month: "STRIPE_PRICE_BASIC_SIX_MONTH",
    basic_annual: "STRIPE_PRICE_BASIC_ANNUAL",
    standard_monthly: "STRIPE_PRICE_STANDARD_MONTHLY",
    standard_quarterly: "STRIPE_PRICE_STANDARD_QUARTERLY",
    standard_six_month: "STRIPE_PRICE_STANDARD_SIX_MONTH",
    standard_annual: "STRIPE_PRICE_STANDARD_ANNUAL",
    extra_credits: "STRIPE_PRICE_EXTRA_CREDIT",
  };
  return names[productId] ?? null;
}

function environmentPriceId(productId: string) {
  const environmentName = priceEnvironmentName(productId);
  const priceId = environmentName ? process.env[environmentName]?.trim() : "";
  if (!environmentName || !priceId) throw new Error("This Stripe test price is not configured yet.");
  return priceId;
}

const catalogProductIds = ["basic", "standard"] as const;
const catalogProductKeys = {
  basic: "stripe_product_basic",
  standard: "stripe_product_standard",
  extraCredits: "stripe_product_extra_credits",
} as const;
const catalogPriceIds = [
  ...catalogProductIds.flatMap((plan) => BILLING_INTERVALS.map((interval) => `${plan}_${interval.id}`)),
  "extra_credits",
];

async function storedStripeCatalog(accountId: string): Promise<StripeCatalog | null> {
  if (await getAppSetting("stripe_catalog_account_id") !== accountId) return null;
  const [basic, standard, extraCredits, ...prices] = await Promise.all([
    getAppSetting(catalogProductKeys.basic),
    getAppSetting(catalogProductKeys.standard),
    getAppSetting(catalogProductKeys.extraCredits),
    ...catalogPriceIds.map((productId) => getAppSetting(`stripe_price_${productId}`)),
  ]);
  if (!basic || !standard || !extraCredits || prices.some((price) => !price)) return null;
  return {
    accountId,
    products: { basic, standard, extraCredits },
    prices: Object.fromEntries(catalogPriceIds.map((productId, index) => [productId, prices[index]!])),
  };
}

async function saveStripeCatalog(catalog: StripeCatalog) {
  await saveAppSetting("stripe_catalog_account_id", catalog.accountId);
  await saveAppSetting(catalogProductKeys.basic, catalog.products.basic);
  await saveAppSetting(catalogProductKeys.standard, catalog.products.standard);
  await saveAppSetting(catalogProductKeys.extraCredits, catalog.products.extraCredits);
  for (const productId of catalogPriceIds) {
    await saveAppSetting(`stripe_price_${productId}`, catalog.prices[productId]);
  }
}

async function environmentStripeCatalog(accountId: string): Promise<StripeCatalog | null> {
  try {
    const prices = Object.fromEntries(catalogPriceIds.map((productId) => [productId, environmentPriceId(productId)]));
    const products = {
      basic: process.env.STRIPE_PRODUCT_BASIC?.trim() || "",
      standard: process.env.STRIPE_PRODUCT_STANDARD?.trim() || "",
      extraCredits: "",
    };
    if (!products.basic || !products.standard) return null;
    const retrieved = await Promise.all(catalogPriceIds.map((productId) =>
      stripeRetrieve(`/prices/${encodeURIComponent(prices[productId])}`)));
    const extraProduct = String(retrieved[catalogPriceIds.indexOf("extra_credits")]?.product || "");
    if (!extraProduct) return null;
    return { accountId, products: { ...products, extraCredits: extraProduct }, prices };
  } catch {
    return null;
  }
}

async function createStripeCatalog(accountId: string): Promise<StripeCatalog> {
  const productValues = {
    basic: {
      name: "AppliTrail Basic",
      description: "10 monthly AI generations, 10 tracked applications and 5 Master CVs.",
    },
    standard: {
      name: "AppliTrail Standard",
      description: "20 monthly AI generations with unlimited application and Master CV tracking.",
    },
  } as const;
  const products = {} as StripeCatalog["products"];
  for (const plan of catalogProductIds) {
    const product = await stripeRequest("/products", {
      ...productValues[plan],
      "metadata[app]": "applitrail",
      "metadata[plan]": plan,
    }, `applitrail-catalog-v2-${accountId}-product-${plan}`);
    if (!product.id) throw new Error(`Stripe did not create the ${PLAN_CATALOG[plan].name} product.`);
    products[plan] = product.id;
  }
  const extraProduct = await stripeRequest("/products", {
    name: "AppliTrail Extra AI Credit",
    description: "One additional AppliTrail AI generation credit.",
    "metadata[app]": "applitrail",
    "metadata[type]": "extra_credit",
  }, `applitrail-catalog-v2-${accountId}-product-extra-credit`);
  if (!extraProduct.id) throw new Error("Stripe did not create the extra-credit product.");
  products.extraCredits = extraProduct.id;

  const prices: Record<string, string> = {};
  for (const plan of catalogProductIds) {
    for (const interval of BILLING_INTERVALS) {
      const productId = `${plan}_${interval.id}`;
      const price = await stripeRequest("/prices", {
        currency: "cad",
        unit_amount: String(interval.amounts[plan]),
        product: products[plan],
        "recurring[interval]": "month",
        "recurring[interval_count]": String(interval.months),
        "metadata[app]": "applitrail",
        "metadata[plan]": plan,
        "metadata[billing_interval]": interval.id,
      }, `applitrail-catalog-v2-${accountId}-price-${productId}`);
      if (!price.id) throw new Error(`Stripe did not create the ${PLAN_CATALOG[plan].name} ${interval.label} price.`);
      prices[productId] = price.id;
    }
  }
  const creditPrice = await stripeRequest("/prices", {
    currency: "cad",
    unit_amount: String(EXTRA_CREDIT_PRICE_CENTS),
    product: products.extraCredits,
    "metadata[app]": "applitrail",
    "metadata[type]": "extra_credit",
  }, `applitrail-catalog-v2-${accountId}-price-extra-credit`);
  if (!creditPrice.id) throw new Error("Stripe did not create the extra-credit price.");
  prices.extra_credits = creditPrice.id;
  return { accountId, products, prices };
}

let catalogPromise: Promise<StripeCatalog> | null = null;

async function ensureStripeCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const account = await stripeRetrieve("/account");
    if (!account.id) throw new Error("Stripe did not return the account for this test key.");
    const stored = await storedStripeCatalog(account.id);
    if (stored) return stored;
    const environment = await environmentStripeCatalog(account.id);
    const catalog = environment ?? await createStripeCatalog(account.id);
    await saveStripeCatalog(catalog);
    return catalog;
  })();
  try {
    return await catalogPromise;
  } catch (error) {
    catalogPromise = null;
    throw error;
  }
}

async function stripePriceId(productId: string) {
  const catalog = await ensureStripeCatalog();
  const priceId = catalog.prices[productId];
  if (!priceId) throw new Error("Choose a valid AppliTrail plan or credit purchase.");
  return priceId;
}

async function ensureStripeCustomer(identity: Identity) {
  const linkage = await getStripeLinkage(identity);
  if (isStripeCustomerId(linkage.customerId)) return { ...linkage, customerId: linkage.customerId };
  const customer = await stripeRequest("/customers", {
    email: identity.email,
    name: identity.displayName,
    "metadata[user_id]": identity.userId,
    "metadata[app]": "applitrail",
  }, `applitrail-customer-${identity.userId}`);
  if (!customer.id) throw new Error("Stripe did not return a customer record.");
  await saveStripeCustomer(identity.userId, customer.id);
  return { ...linkage, customerId: customer.id };
}

export async function createStripeCheckout(
  identity: Identity,
  productId: string,
  quantity: number,
  requestId: string,
  origin: string,
) {
  if (paymentMode() !== "stripe") throw new Error("Stripe checkout is disabled for this deployment.");
  const cleanedRequestId = cleanRequestId(requestId);
  const linkage = await ensureStripeCustomer(identity);
  const isCreditPurchase = productId === "extra_credits";
  const subscription = subscriptionProduct(productId);
  if (!isCreditPurchase && !subscription) throw new Error("Choose a valid AppliTrail plan or credit purchase.");
  if (subscription && linkage.account.plan !== "free" && isStripeSubscriptionId(linkage.subscriptionId)) {
    throw new Error("Use Manage subscription to change an active Stripe plan.");
  }
  const safeQuantity = isCreditPurchase ? Math.max(1, Math.min(100, Math.round(quantity))) : 1;
  const metadata: Record<string, string> = {
    "metadata[user_id]": identity.userId,
    "metadata[product_id]": productId,
    "metadata[app]": "applitrail",
  };
  if (isCreditPurchase) metadata["metadata[credits]"] = String(safeQuantity);
  if (subscription) {
    metadata["metadata[plan]"] = subscription.plan;
    metadata["metadata[billing_interval]"] = subscription.interval.id;
  }
  const values: Record<string, string> = {
    mode: isCreditPurchase ? "payment" : "subscription",
    customer: linkage.customerId,
    client_reference_id: identity.userId,
    "line_items[0][price]": await stripePriceId(productId),
    "line_items[0][quantity]": String(safeQuantity),
    success_url: `${origin}/app?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/app?billing=cancelled`,
    billing_address_collection: "auto",
    ...metadata,
  };
  if (subscription) {
    values.allow_promotion_codes = "true";
    values["subscription_data[metadata][user_id]"] = identity.userId;
    values["subscription_data[metadata][product_id]"] = productId;
    values["subscription_data[metadata][plan]"] = subscription.plan;
    values["subscription_data[metadata][billing_interval]"] = subscription.interval.id;
    values["subscription_data[metadata][app]"] = "applitrail";
  } else {
    values["payment_intent_data[metadata][user_id]"] = identity.userId;
    values["payment_intent_data[metadata][product_id]"] = productId;
    values["payment_intent_data[metadata][credits]"] = String(safeQuantity);
  }
  if (process.env.STRIPE_AUTOMATIC_TAX === "true") {
    values["automatic_tax[enabled]"] = "true";
    values["customer_update[address]"] = "auto";
    values["customer_update[name]"] = "auto";
  }
  const session = await stripeRequest("/checkout/sessions", values,
    `applitrail-checkout-${identity.userId}-${cleanedRequestId}`);
  if (!session.url) throw new Error("Stripe did not return a checkout page.");
  return { checkoutUrl: session.url };
}

export async function createStripePortal(identity: Identity, origin: string) {
  if (paymentMode() !== "stripe") throw new Error("Stripe billing management is disabled for this deployment.");
  const linkage = await getStripeLinkage(identity);
  if (!isStripeCustomerId(linkage.customerId)) {
    throw new Error("Complete a Stripe checkout before managing this subscription.");
  }
  const configurationId = await ensureStripePortalConfiguration();
  const session = await stripeRequest("/billing_portal/sessions", {
    customer: linkage.customerId,
    return_url: `${origin}/app`,
    configuration: configurationId,
  });
  if (!session.url) throw new Error("Stripe did not return a billing portal page.");
  return { portalUrl: session.url };
}

export async function ensureStripePortalConfiguration() {
  const catalog = await ensureStripeCatalog();
  const settingKey = `stripe_portal_configuration_id_${catalog.accountId}`;
  const stored = await getAppSetting(settingKey);
  if (stored) return stored;
  const basicPrices = ["basic_monthly", "basic_quarterly", "basic_six_month", "basic_annual"]
    .map((productId) => catalog.prices[productId]);
  const standardPrices = ["standard_monthly", "standard_quarterly", "standard_six_month", "standard_annual"]
    .map((productId) => catalog.prices[productId]);
  const values: Record<string, string> = {
    "business_profile[headline]": "Manage your AppliTrail subscription",
    "business_profile[privacy_policy_url]": "https://applitrail.com/privacy",
    "business_profile[terms_of_service_url]": "https://applitrail.com/terms",
    default_return_url: "https://applitrail.com/app",
    "features[payment_method_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][proration_behavior]": "none",
    "features[subscription_update][enabled]": "true",
    "features[subscription_update][default_allowed_updates][0]": "price",
    "features[subscription_update][proration_behavior]": "create_prorations",
    "features[subscription_update][products][0][product]": catalog.products.basic,
    "features[subscription_update][products][1][product]": catalog.products.standard,
  };
  basicPrices.forEach((price, index) => {
    values[`features[subscription_update][products][0][prices][${index}]`] = price;
  });
  standardPrices.forEach((price, index) => {
    values[`features[subscription_update][products][1][prices][${index}]`] = price;
  });
  const configuration = await stripeRequest("/billing_portal/configurations", values,
    `applitrail-customer-portal-v2-${catalog.accountId}`);
  if (!configuration.id) throw new Error("Stripe did not return a portal configuration.");
  await saveAppSetting(settingKey, configuration.id);
  return configuration.id;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyStripeWebhook(payload: string, signatureHeader: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("Stripe webhook verification is not configured.");
  if (!signatureHeader) throw new Error("Stripe webhook signature is missing.");
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestampNumber = Number(timestamp);
  if (!timestamp || !Number.isFinite(timestampNumber) || !signatures.length) {
    throw new Error("Stripe webhook signature is invalid.");
  }
  if (Math.abs(Math.floor(Date.now() / 1_000) - timestampNumber) > 300) {
    throw new Error("Stripe webhook signature has expired.");
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key,
    new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = bytesToHex(digest);
  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) {
    throw new Error("Stripe webhook signature is invalid.");
  }
  return JSON.parse(payload) as {
    id: string;
    type: string;
    data?: { object?: Record<string, unknown> };
  };
}
