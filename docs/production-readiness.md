# AppliTrail production-readiness baseline

This document defines the first release gate for taking AppliTrail from a public beta to a dependable production service. It supplements the existing operations and cloud-migration runbooks.

## Customer journeys that must always be checked

Every release must verify that a user can sign in, load and save persistent account data, upload and reopen a genuine CV, create an application, and keep that data after a service restart. Administrator search and trusted-gateway authentication must also pass. Billing and AI journeys should be exercised in their test modes before a production promotion.

The automated standalone smoke check now also verifies that anonymous requests are rejected, cross-site mutations are blocked, disguised CV uploads are rejected, and protective response headers are present.

## Initial service objectives

- Availability target: 99.9% monthly for signed-in application tracking.
- Data durability target: no acknowledged user-state write may be silently lost.
- Recovery point objective: 24 hours during beta; reduce to 1 hour before general availability.
- Recovery time objective: 4 hours during beta; reduce to 1 hour before general availability.
- API latency objective: 95% of non-AI requests complete within 750 ms, excluding client network time.
- AI generation: measure success rate and duration separately because it relies on an external provider.

## Operational signals

The Cloudflare entry point emits one structured completion record for each request. It contains only a request ID, method, path, status, and duration. Query strings, request bodies, CV content, job descriptions, email addresses, and generated documents are not logged. Failed requests receive a request ID that can be used to correlate a customer report with platform logs.

Alerting should be configured for readiness failures, a five-minute 5xx rate above 2%, a fifteen-minute AI failure rate above 10%, Stripe webhook failures, repeated database errors, and approaching storage or database quotas.

## Release gates

1. Type checking, cloud compatibility checks, unit tests, runtime tests, and the standalone smoke journey pass.
2. Database changes are forward-only and compatible with the currently deployed application during rollout.
3. A current backup exists and a restore has been rehearsed within the previous quarter.
4. Stripe changes are tested with test-mode checkout and signed webhook events.
5. The candidate version is exercised in staging before public promotion.
6. Rollback must deploy the previous application image without deleting or replacing persistent storage.

## Remaining steps before general availability

- Connect structured logs to an external monitoring and alerting service.
- Add browser-based end-to-end tests for signup, application creation, CV tailoring, billing, reminders, and account recovery.
- Add dependency and source-code security scanning to repository protections.
- Complete an independent penetration test and privacy/legal review.
- Establish customer support ownership, incident escalation, and a published status channel.
