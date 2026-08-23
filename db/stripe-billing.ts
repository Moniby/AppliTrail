import {
  type Identity,
  getAppSetting,
  getStripeLinkage,
  paymentMode,
  saveAppSetting,
  saveStripeCustomer,
  subscriptionProduct,
} from "./appliflow-store";

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-02-25.clover";

type StripeResponse = Record<string, unknown> & { id?: string; url?: string };

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Stripe test payments are not configured yet.");
  return key;
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

function stripePriceId(productId: string) {
  const environmentName = priceEnvironmentName(productId);
  const priceId = environmentName ? process.env[environmentName]?.trim() : "";
  if (!environmentName || !priceId) throw new Error("This Stripe test price is not configured yet.");
  return priceId;
}

async function ensureStripeCustomer(identity: Identity) {
  const linkage = await getStripeLinkage(identity);
  if (linkage.customerId) return { ...linkage, customerId: linkage.customerId };
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
  if (subscription && linkage.account.plan !== "free" && linkage.subscriptionId) {
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
    "line_items[0][price]": stripePriceId(productId),
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
  if (!linkage.customerId) throw new Error("No Stripe billing profile exists for this account yet.");
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
  const configured = process.env.STRIPE_PORTAL_CONFIGURATION_ID?.trim();
  if (configured) return configured;
  const stored = await getAppSetting("stripe_portal_configuration_id");
  if (stored) return stored;
  const basicProduct = process.env.STRIPE_PRODUCT_BASIC?.trim();
  const standardProduct = process.env.STRIPE_PRODUCT_STANDARD?.trim();
  if (!basicProduct || !standardProduct) throw new Error("Stripe portal products are not configured yet.");
  const basicPrices = ["basic_monthly", "basic_quarterly", "basic_six_month", "basic_annual"].map(stripePriceId);
  const standardPrices = ["standard_monthly", "standard_quarterly", "standard_six_month", "standard_annual"].map(stripePriceId);
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
    "features[subscription_update][products][0][product]": basicProduct,
    "features[subscription_update][products][1][product]": standardProduct,
  };
  basicPrices.forEach((price, index) => {
    values[`features[subscription_update][products][0][prices][${index}]`] = price;
  });
  standardPrices.forEach((price, index) => {
    values[`features[subscription_update][products][1][prices][${index}]`] = price;
  });
  const configuration = await stripeRequest("/billing_portal/configurations", values,
    "applitrail-customer-portal-v1");
  if (!configuration.id) throw new Error("Stripe did not return a portal configuration.");
  await saveAppSetting("stripe_portal_configuration_id", configuration.id);
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
