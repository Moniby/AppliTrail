import { identityFromTrustedHeaders, type Identity } from "../platform/identity";

export function requestUser(request: Request): Identity | null {
  const identity = identityFromTrustedHeaders(request.headers);
  if (!identity) {
    if (process.env.NODE_ENV !== "production") {
      return { userId: "appliflow-local-user", email: "local@appliflow.test", displayName: "Local User" };
    }
    return null;
  }
  return identity;
}

export function authenticationRequired() {
  return Response.json(
    { error: "Sign in with Google, ChatGPT or email to continue.", signInUrl: "/signin?return_to=%2Fapp" },
    { status: 401 },
  );
}
