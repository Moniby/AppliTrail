# AppliTrail cloud-ready architecture

## Refactor objective

AppliTrail keeps its current Cloudflare Sites deployment, D1 database, R2 resume
storage, user experience, and production data. The code now has explicit runtime,
SQL, object-storage, and trusted-identity boundaries so a second hosting target can
be introduced without rewriting application screens or billing rules.

## Runtime modes

| Mode | Application host | Database | Resume files | Intended use |
| --- | --- | --- | --- | --- |
| Current production | Cloudflare Sites/Workers | D1 | R2 | Live AppliTrail site |
| Portable container | Node standalone server | SQLite under `/data` | Files under `/data/resumes` | Local validation, demos, and a single-instance bridge |
| Future Azure | Azure Container Apps | Azure Database for PostgreSQL | Azure Blob Storage | Multi-instance production |

The portable container is not the final Azure database design. SQLite is suitable
for a single container with one persistent volume, but not for horizontal scaling.
Before Azure production cutover, add PostgreSQL and Blob Storage adapters behind
the contracts in `platform/`, migrate a verified copy of the data, and run dual-read
validation.

## Request boundary

`worker/index.ts` selects the runtime for every process:

- Cloudflare binding objects select the existing D1/R2 provider.
- A regular Node process selects the persistent filesystem provider.
- Application routes continue to call the same database and file-storage APIs.

Health probes are intentionally separate:

- `/api/health` confirms the application process is alive.
- `/api/ready` confirms the database and resume-storage provider are reachable.

## Identity and security boundary

The live Sites environment continues to supply authenticated identity headers.
The portable identity mapper accepts configurable header names for a future gateway.
Those headers are trusted only after a gateway has verified the user's session or
token and removed any client-supplied copies.

For Azure, use Microsoft Entra External ID or another OIDC provider that supports
Google and email/password accounts. The gateway should pass a stable immutable user
ID, email, and display name to AppliTrail. Never use email alone as the database key.

## Data-preservation rule

Application releases and data migrations are different operations:

1. A new image is built and tested without production secrets or production data.
2. Production data remains in D1/R2 or a mounted `/data` volume; it is never copied
   into the image.
3. Database migrations are forward-only, versioned, backed up, and rehearsed on a
   restored copy before production.
4. Deployments use an immutable image digest and retain the previous working image.
5. A database rollback is performed only from a verified backup, never by reverting
   application files.

## Azure cutover path

1. Provision Azure Container Registry, Container Apps, Key Vault, PostgreSQL,
   Blob Storage, Application Insights, and Front Door/custom-domain certificates.
2. Implement PostgreSQL and Blob adapters and add provider contract tests.
3. Configure OIDC authentication with Google and email/password choices.
4. Export D1 and R2, import into staging PostgreSQL/Blob, and reconcile record and
   file counts plus hashes.
5. Run staging load, security, billing-webhook, backup, and restore tests.
6. Freeze writes briefly, perform the incremental data sync, switch DNS, and monitor.
7. Keep Cloudflare read-only and the previous image available through the agreed
   rollback window.

## AWS equivalent

The same container and contracts map to ECS/Fargate, RDS PostgreSQL, S3, Secrets
Manager, CloudWatch, Cognito/OIDC, ECR, and CloudFront. No UI rewrite is required.
