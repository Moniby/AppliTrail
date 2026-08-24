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
| Portable container | Node standalone server | PostgreSQL | Azure Blob-compatible storage | Local validation and future staging |
| Single-instance fallback | Node standalone server | SQLite under `/data` | Files under `/data/resumes` | Offline development and recovery tooling |
| Future Azure | Azure Container Apps | Azure Database for PostgreSQL | Azure Blob Storage | Multi-instance production |

PostgreSQL and Azure Blob adapters are implemented behind the contracts in
`platform/` and are exercised with local containers. SQLite remains a deliberate
single-instance fallback, not the future multi-instance production database.

## Request boundary

`worker/index.ts` selects the runtime for every process:

- Cloudflare binding objects select the existing D1/R2 provider.
- A regular Node process selects PostgreSQL/Azure Blob when their provider settings
  are present, or the persistent SQLite/filesystem fallback otherwise.
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
Google and email/password accounts. The trusted gateway contract requires a stable
immutable user ID, verified email, display name and a private gateway secret. Never
use email alone as the database key. See `docs/portable-authentication.md`.

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
2. Provision managed PostgreSQL and Blob resources and run the existing provider
   contract and restore tests against staging.
3. Configure the trusted OIDC gateway with Google and email/password choices.
4. Export D1 and R2, import into staging PostgreSQL/Blob, and reconcile record and
   file counts plus hashes.
5. Run staging load, security, billing-webhook, backup, and restore tests.
6. Freeze writes briefly, perform the incremental data sync, switch DNS, and monitor.
7. Keep Cloudflare read-only and the previous image available through the agreed
   rollback window.

## AWS equivalent

The same container and contracts map to ECS/Fargate, RDS PostgreSQL, S3, Secrets
Manager, CloudWatch, Cognito/OIDC, ECR, and CloudFront. No UI rewrite is required.
