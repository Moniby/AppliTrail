import { acceptPolicies, deleteAccountData, ensureUser, getUsageSummary, recordLoginEvent } from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

export async function POST(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  const payload = await request.json().catch(() => ({})) as { action?: string };
  if (payload.action !== "accept-policies" && payload.action !== "record-login") return Response.json({ error: "Unknown account action." }, { status: 400 });
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return Response.json({ error: "This AppliTrail account is suspended. Contact the administrator for help." }, { status: 403 });
  if (payload.action === "record-login") {
    const recorded = await recordLoginEvent(account.userId, request.headers.get("user-agent") || "Unknown browser");
    return Response.json({ recorded });
  }
  const updated = await acceptPolicies(account.userId);
  return Response.json({ account: updated, usage: await getUsageSummary(account.userId) });
}

export async function DELETE(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  await deleteAccountData(identity.userId);
  return Response.json({ deleted: true, signOutUrl: "/signout-with-chatgpt?return_to=%2F" });
}
