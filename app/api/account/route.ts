import { acceptPolicies, deleteAccountData, ensureUser, getUsageSummary } from "../../../db/appliflow-store";
import { authenticationRequired, requestUser } from "../../request-user";

export async function POST(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  const payload = await request.json().catch(() => ({})) as { action?: string };
  if (payload.action !== "accept-policies") return Response.json({ error: "Unknown account action." }, { status: 400 });
  const account = await ensureUser(identity);
  if (account.accountStatus === "suspended") return Response.json({ error: "This AppliFlow account is suspended. Contact the administrator for help." }, { status: 403 });
  const updated = await acceptPolicies(account.userId);
  return Response.json({ account: updated, usage: await getUsageSummary(account.userId) });
}

export async function DELETE(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  await deleteAccountData(identity.userId);
  return Response.json({ deleted: true, signOutUrl: "/signout-with-chatgpt?return_to=%2F" });
}
