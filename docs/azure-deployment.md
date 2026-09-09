# Azure deployment activation guide

The Azure path is committed but deliberately inactive. The current Sites staging
and production environments remain authoritative until an Azure migration is
separately approved and completed. Enabling the workflow does not migrate or delete
any customer record, uploaded CV, payment history, or generated document.

## What the prepared workflow does

After activation, every successful `main` CI run deploys the exact tested revision
to the GitHub `staging` environment. Production remains manual and requires both the
GitHub `production` environment approval and the text confirmation
`DEPLOY_PRODUCTION`.

The workflow:

1. signs in to Azure through short-lived OpenID Connect credentials;
2. creates or updates the isolated environment resource group;
3. provisions Azure Container Registry and publishes an immutable revision-tagged
   image;
4. applies `infra/azure/main.bicep` idempotently;
5. retains application data outside the image in PostgreSQL and Blob Storage; and
6. runs health and readiness checks when external ingress is enabled.

`AZURE_DEPLOYMENTS_ENABLED` is intentionally absent or `false`, so none of these
steps can currently modify an Azure subscription.

## Azure resources

Each environment receives separately named resources:

- Azure Container Apps and a Container Apps managed environment;
- Azure Container Registry;
- Azure Database for PostgreSQL Flexible Server;
- Azure Blob Storage with soft deletion for CV files;
- Azure Key Vault for database, OpenAI, Stripe and gateway secrets;
- a user-assigned managed identity with Key Vault and registry access;
- Log Analytics and Application Insights; and
- liveness and readiness probes with environment-appropriate scaling.

External ingress defaults to `false`. Do not enable it until the trusted identity
gateway described in `docs/portable-authentication.md` is configured and tested.

## One-time Azure and GitHub setup

Create a Microsoft Entra application or user-assigned managed identity with a
federated credential for this repository and each GitHub environment. It needs
permission to deploy into the selected resource groups. The first infrastructure
deployment also needs permission to create the scoped Key Vault and ACR role
assignments; narrow the deployment identity after bootstrap.

Create GitHub environments named `staging` and `production`. Require owner approval
on `production`. Configure these environment variables:

| Variable | Purpose |
| --- | --- |
| `AZURE_CLIENT_ID` | Federated deployment identity |
| `AZURE_TENANT_ID` | Microsoft Entra tenant containing the identity |
| `AZURE_SUBSCRIPTION_ID` | Target Azure subscription |
| `AZURE_RESOURCE_GROUP` | Unique group for this environment |
| `AZURE_LOCATION` | Azure region, normally `canadacentral` |
| `APPLITRAIL_PUBLIC_URL` | Environment URL after ingress is approved |
| `APPLIFLOW_ADMIN_EMAIL` | Temporary administrator bootstrap email |
| `AZURE_EXTERNAL_INGRESS` | Keep `false` until authentication is ready |
| `STRIPE_PRODUCT_*` / `STRIPE_PRICE_*` | Environment-specific Stripe catalogue IDs |

Configure these as GitHub environment secrets:

- `POSTGRES_ADMIN_PASSWORD` (URL-safe, randomly generated);
- `OPENAI_API_KEY`;
- `STRIPE_SECRET_KEY`;
- `STRIPE_WEBHOOK_SECRET`; and
- `APPLITRAIL_AUTH_GATEWAY_SECRET`.

Never reuse staging secrets in production. Support email variables can remain unset
until email delivery is implemented later.

## Activation sequence

1. Keep the repository-level variable `AZURE_DEPLOYMENTS_ENABLED=false`.
2. Validate the Bicep deployment with an Azure staging resource group.
3. Configure the staging GitHub environment and use the manual workflow with
   environment `staging` and confirmation `DEPLOY`.
4. Configure and test the identity gateway, then set staging
   `AZURE_EXTERNAL_INGRESS=true`.
5. Rehearse backup, export, restore and reconciliation using non-production data.
6. Set the repository-level `AZURE_DEPLOYMENTS_ENABLED=true` only after staging is
   approved. Successful `main` builds will then update Azure staging automatically.
7. Configure production independently. Run the workflow manually with environment
   `production` and confirmation `DEPLOY_PRODUCTION`; approve the protected GitHub
   environment when prompted.

## Data migration and rollback

Application deployment and customer-data migration remain separate. Do not point
the Azure production app at live traffic until the D1/R2 export has been restored to
PostgreSQL/Blob and record counts plus file checksums reconcile. During cutover,
retain the previous container revision and keep the existing Sites application
available for the agreed rollback period. A code rollback must never recreate or
restore the database automatically.
