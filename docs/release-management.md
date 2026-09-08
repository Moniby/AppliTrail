# AppliTrail release management

## Environments

- **Local development** uses disposable local data and test credentials.
- **Staging** is private, visibly labelled, and uses separate Sites database and file storage resources. It must use OpenAI and Stripe test credentials only.
- **Production** serves `applitrail.com` and retains its existing customer data, payment configuration, database and file storage.

Never copy production secrets, databases, uploaded CVs or customer records into staging.

## Release path

1. A pull request or push to `main` must pass application, persistence, security, container and browser-journey checks.
2. A successful CI run prepares a staging-labelled release candidate from that exact revision.
3. The owner publishes that revision to the private staging Site and verifies sign-in, application tracking, CV storage, AI generation, credits, subscriptions, administration and mobile navigation.
4. Production validation is started manually with the full approved revision and the confirmation `PUBLISH`.
5. The validated revision is published to Sites only after owner approval. Production data resources and secrets remain attached rather than recreated.

## Live AI verification

Run `npm run test:ai:live` only when a staging OpenAI key is available and a live-generation check has been approved. The check creates a disposable local account and database, generates one tailored CV, cover letter, phone-screen brief and interview-practice brief, then verifies the four credit-audit entries. It never reads or writes staging or production customer records. The four API generations may incur a small OpenAI usage charge.

The GitHub workflows validate release candidates but do not possess Sites deployment credentials and therefore cannot publish either environment by themselves.

## Rollback

1. Stop further releases and identify the last known-good Sites version.
2. Republish that saved version without changing database or storage bindings.
3. Check `/api/health`, `/api/ready`, sign-in and one read-only application view.
4. Investigate the failed revision in staging before another production attempt.

A code rollback must not delete, recreate or restore customer data unless a separately approved data-recovery procedure requires it.

## Monitoring

GitHub checks `https://applitrail.com/api/health` and `/api/ready` twice an hour. A failure appears as a failed **Monitor production availability** workflow. Review the last production deployment and runtime logs before changing data or secrets.

## Secret handling

Store hosted values in the Sites environment manager and mark API keys, webhook secrets and encryption material as secrets. Local `.env.local` files remain ignored by Git and are never packaged into a release.
