# Portable authentication boundary

## What is active today

The public Cloudflare Sites deployment continues to use the existing secure
ChatGPT/Google account gateway. No live sign-in route or existing user identifier is
changed by the portable refactor.

For a future container deployment, AppliTrail supports a trusted OIDC gateway. The
gateway may offer Google and email/password accounts, but it must authenticate the
user before forwarding identity to the application.

## Required identity claims

The gateway sends:

- a stable, immutable provider subject as the user ID;
- the verified email address;
- an optional display name; and
- a private gateway secret header that browsers cannot provide directly.

Configure the mapped header names with `APPLITRAIL_AUTH_*_HEADER`. Configure
`APPLITRAIL_AUTH_MODE=gateway`, a strong `APPLITRAIL_AUTH_GATEWAY_SECRET`, and the
matching secret-header name for a portable deployment. The application rejects
otherwise valid-looking identity headers when the gateway secret is missing.

The application container must not be publicly reachable behind the gateway. Only
the gateway or private service network may connect to its application port.

## Administrator bootstrap

Set `APPLIFLOW_ADMIN_EMAIL` through the environment's secret/configuration store.
The confirmed owner email is kept in the ignored local environment and is not
committed to GitHub. A stable provider user ID should replace the email bootstrap
after the first successful production sign-in.

## Google and email/password setup later

The chosen OIDC provider should:

1. enable self-service email/password registration, email verification and password
   reset;
2. configure Google as an external identity provider;
3. link accounts only after verified-email and explicit user confirmation checks;
4. use short-lived sessions, secure HTTP-only cookies and rotation/revocation;
5. pass the immutable OIDC `sub` claim to AppliTrail; and
6. keep passwords, Google tokens and recovery credentials outside AppliTrail.

Google client credentials, email-delivery credentials and OIDC secrets are not
needed for local infrastructure validation and must never be committed to the repo.
