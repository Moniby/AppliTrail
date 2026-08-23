import { processStripeWebhookEvent } from "../../../../db/appliflow-store";
import { verifyStripeWebhook } from "../../../../db/stripe-billing";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const event = await verifyStripeWebhook(payload, request.headers.get("stripe-signature"));
    const result = await processStripeWebhookEvent(event);
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe webhook processing failed.";
    const status = /signature|verification|invalid|expired|missing/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
