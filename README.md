# AppliTrail

AppliTrail is a secure career workspace for tracking applications, maintaining
Master CVs, generating tailored CVs and cover letters, preparing for interviews,
and managing follow-up reminders.

Repository: <https://github.com/Moniby/AppliTrail>

## Current deployment and portability

The live application continues to use Cloudflare Sites, D1, and R2. This repository
also emits a self-contained Node server and a production container. The container
stores its database and uploaded resumes outside the image under `/data`, so a new
application version does not erase user data.

See [docs/cloud-architecture.md](docs/cloud-architecture.md) for the Azure migration
boundary and [docs/portable-authentication.md](docs/portable-authentication.md) for
the Google/email identity boundary.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The existing Cloudflare bindings are simulated locally. Do not place secrets in
source control; use ignored environment files or the hosting platform's secret store.

## Verification

```bash
npm run ci
```

This checks TypeScript, the new cloud boundaries, the production build, existing UI
regressions, SQLite/file fallback persistence and trusted-gateway authentication.

The legacy dashboard currently has a separate lint backlog, so `lint:cloud` gates
new infrastructure code without silently weakening the existing lint rules.

## Container

```bash
docker compose up --build
```

Open <http://localhost:3000>. The named `applitrail-data` volume holds the SQLite
fallback, while the normal Compose stack uses named PostgreSQL and Azurite volumes.
Run `npm run test:portable` to verify database, uploaded-file, restart, backup and
restore behaviour. See [docs/operations.md](docs/operations.md) for the runbook.

For a direct run:

```bash
docker build -t applitrail:local .
docker run --name applitrail -p 3000:3000 -v applitrail-data:/data applitrail:local
```

Pass secrets at runtime using your platform's secret manager. Never include OpenAI
or Stripe keys in a Docker build argument, image, repository, or compose file.

## GitHub Actions

- `CI` runs on pull requests and pushes to `main`, verifies both persistence modes,
  tests the trusted authentication boundary, and builds the container without
  publishing it.
- `Publish container` runs manually or for a `v*` tag and publishes immutable SHA
  and release tags to `ghcr.io/moniby/applitrail` with provenance and an SBOM.
- Neither workflow deploys the application or changes the live public site.

## Data safety during releases

- Cloudflare production data remains in D1/R2.
- Container data remains in the mounted `/data` volume.
- Images are immutable and contain no user records or uploaded CVs.
- Back up data before every schema or provider migration.
- Rehearse restore and record/file reconciliation before a production cutover.

## Health endpoints

- `GET /api/health` — process liveness.
- `GET /api/ready` — database and resume-storage readiness.
