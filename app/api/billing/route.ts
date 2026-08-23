import {
  completeDemoCheckout,
  getBillingSummary,
  paymentMode,
  resumeSubscription,
  scheduleSubscriptionCancellation,
} from "../../../db/appliflow-store";
import { createStripeCheckout, createStripePortal, reconcileStripeCheckout, syncStripeBilling } from "../../../db/stripe-billing";
import { authenticationRequired, requestUser } from "../../request-user";

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    if (paymentMode() === "stripe") {
      try {
        await syncStripeBilling(identity);
      } catch (error) {
        console.warn("AppliTrail Stripe status sync was unavailable", {
          message: error instanceof Error ? error.message : "Unknown Stripe sync error",
        });
      }
    }
    return Response.json(await getBillingSummary(identity));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Billing information is unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const payload = await request.json() as {
      action?: "checkout" | "cancel" | "resume" | "portal" | "reconcile";
      productId?: string;
      quantity?: number;
      requestId?: string;
      sessionId?: string;
    };
    const requestId = String(payload.requestId || "");
    if (payload.action === "checkout") {
      if (paymentMode() === "stripe") {
        return Response.json(await createStripeCheckout(identity, String(payload.productId || ""),
          Number(payload.quantity) || 1, requestId, new URL(request.url).origin));
      }
      return Response.json(await completeDemoCheckout(identity, String(payload.productId || ""), Number(payload.quantity) || 1, requestId));
    }
    if (payload.action === "portal") {
      return Response.json(await createStripePortal(identity, new URL(request.url).origin));
    }
    if (payload.action === "reconcile") {
      if (paymentMode() !== "stripe") throw new Error("Stripe checkout reconciliation is disabled for this deployment.");
      await reconcileStripeCheckout(identity, String(payload.sessionId || ""));
      return Response.json(await getBillingSummary(identity));
    }
    if (payload.action === "cancel") {
      if (paymentMode() === "stripe") return Response.json(await createStripePortal(identity, new URL(request.url).origin));
      return Response.json(await scheduleSubscriptionCancellation(identity, requestId));
    }
    if (payload.action === "resume") {
      if (paymentMode() === "stripe") return Response.json(await createStripePortal(identity, new URL(request.url).origin));
      return Response.json(await resumeSubscription(identity, requestId));
    }
    return Response.json({ error: "Choose a valid billing action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The billing request could not be completed.";
    console.error("AppliTrail billing request failed", { message });
    const status = /invalid|choose|disabled|configured|hold up to|manage subscription|billing profile|paid plans?/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
