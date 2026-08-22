import {
  completeDemoCheckout,
  getBillingSummary,
  resumeSubscription,
  scheduleSubscriptionCancellation,
} from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
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
      action?: "checkout" | "cancel" | "resume";
      productId?: string;
      quantity?: number;
      requestId?: string;
    };
    const requestId = String(payload.requestId || "");
    if (payload.action === "checkout") {
      return Response.json(await completeDemoCheckout(identity, String(payload.productId || ""), Number(payload.quantity) || 1, requestId));
    }
    if (payload.action === "cancel") {
      return Response.json(await scheduleSubscriptionCancellation(identity, requestId));
    }
    if (payload.action === "resume") {
      return Response.json(await resumeSubscription(identity, requestId));
    }
    return Response.json({ error: "Choose a valid billing action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The sandbox checkout could not be completed.";
    const status = /invalid|choose|disabled|configured|hold up to/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
