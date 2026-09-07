const TRUSTED_FETCH_SITES = new Set(["same-origin", "none"]);

/**
 * Reject browser mutations initiated by another website. Requests made by
 * trusted gateways and server clients may omit browser fetch metadata.
 */
export function rejectCrossSiteMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && !TRUSTED_FETCH_SITES.has(fetchSite)) {
    return Response.json({ error: "This request could not be verified. Refresh AppliTrail and try again." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    if (new URL(origin).origin === new URL(request.url).origin) return null;
  } catch {
    // An invalid Origin is never a trusted browser origin.
  }
  return Response.json({ error: "This request could not be verified. Refresh AppliTrail and try again." }, { status: 403 });
}
