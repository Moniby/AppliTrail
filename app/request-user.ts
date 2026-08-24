import { identityFromRequestHeaders, type Identity } from "../platform/identity";

export function requestUser(request: Request): Identity | null {
  return identityFromRequestHeaders(request.headers);
}

export function authenticationRequired() {
  return Response.json(
    { error: "Sign in with Google, ChatGPT or email to continue.", signInUrl: "/signin?return_to=%2Fapp" },
    { status: 401 },
  );
}
