# Portable operations runbook

## Environment separation

| Environment | Data | Payments | Releases |
| --- | --- | --- | --- |
| Development | Disposable local PostgreSQL and Azurite volumes | Demo/test only | Local builds |
| Staging | Separate managed database, Blob container and identity tenant | Stripe test | Manually approved image digest |
| Production | Production-only managed services and secrets | Stripe live | Manually approved immutable image digest |

Never reuse database URLs, storage containers, identity tenants, Stripe webhook
secrets or encryption secrets between staging and production.

## Support email delivery

Set `RESEND_API_KEY`, `SUPPORT_FROM_EMAIL` and `SUPPORT_ADMIN_EMAIL` independently
in staging and production. The sender address must belong to a domain verified by
the email provider. User reports, administrator replies and status updates remain
stored in AppliTrail even if email delivery is unavailable. Urgent reports also
notify the configured administrator address.

## Local portability proof

`docker compose up --build -d` starts AppliTrail, PostgreSQL and the Azure Blob
emulator. `npm run test:portable` writes an isolated account and resume, restarts the
application, verifies both persisted, creates a full backup, empties the test target,
restores it, verifies checksums and content, and removes the test account.

The credentials in `compose.yaml` are intentionally local-only and must never be
used by a hosted environment.

## Backup

With `DATABASE_URL`, `AZURE_STORAGE_CONNECTION_STRING` and
`AZURE_STORAGE_CONTAINER` pointing at the intended environment:

```bash
npm run backup:portable -- backups/applitrail-YYYY-MM-DD
```

The backup contains structured rows, Blob bytes, metadata, counts and SHA-256
checksums. Store production backups in encrypted storage separate from the running
application and apply an explicit retention policy.

## Restore safety

Restores refuse to run unless every target table and the Blob container are empty.
After verifying the target is an isolated restore environment, set the confirmation
value for that one operation:

```bash
APPLITRAIL_RESTORE_CONFIRM=empty-target npm run restore:portable -- backups/applitrail-YYYY-MM-DD
```

Always rehearse restore in staging and reconcile user, state, billing, AI-audit and
file counts plus file checksums before a production migration.

## Release controls

- Pull requests and pushes to `main` run application, persistence, security-gateway
  and portable-stack checks, plus browser journeys covering public access,
  application tracking, AI confirmation and saved output, reminders, CV file
  storage, administrator search, and mobile navigation.
- Container publication is manual or release-tag driven and does not deploy.
- Successful CI builds prepare a staging-labelled candidate from the exact validated
  revision. The private staging Site remains an owner-controlled publish.
- Production validation requires the full staging-approved revision plus an explicit
  `PUBLISH` confirmation and targets the protected `production` environment.
- Production health and readiness are checked twice an hour.
- Production data is never included in a container image.

See [release management](release-management.md) for environment separation,
approval, monitoring and rollback instructions.

## Prepared Azure pipeline

Azure deployment is defined in `.github/workflows/azure-deploy.yml` and remains
inactive while `AZURE_DEPLOYMENTS_ENABLED` is missing or set to `false`. This is a
repository-level safety switch; environment-specific credentials and settings stay
inside the protected GitHub `staging` and `production` environments. Follow
`docs/azure-deployment.md` before enabling it.
