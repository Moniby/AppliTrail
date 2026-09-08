import { createSupportIssue, getUserSupportIssues } from "../../../db/appliflow-store";
import { rejectCrossSiteMutation } from "../../api-security";
import { authenticationRequired, requestUser } from "../../request-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    return Response.json({ issues: await getUserSupportIssues(identity) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Issue reports are unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const untrusted = rejectCrossSiteMutation(request);
  if (untrusted) return untrusted;
  const identity = requestUser(request);
  if (!identity) return authenticationRequired();
  try {
    const body = await request.json() as { category?: string; priority?: string; summary?: string; details?: string; screen?: string };
    const issue = await createSupportIssue(identity, body);
    return Response.json({ issue }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Your report could not be saved." }, { status: 400 });
  }
}
