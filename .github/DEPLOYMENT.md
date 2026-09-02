# Deployment

Backend on **one AWS EC2 instance** running docker compose. Frontend on
**Vercel**. Postgres on **Supabase**. Driven by GitHub Actions.

**Production only, to start.** The staging path is written and dispatch-only —
see Flow below for why.

Nothing is provisioned yet. This is the setup checklist and the reference for
how the pipeline behaves once it is.

---

## Shape

```
EC2 t3.small (Ubuntu 24.04, us-west-2)
└─ docker compose
   ├─ caddy      :80 :443   TLS, reverse proxy
   ├─ app        :5000      the Express backend (internal only)
   └─ redis      :6379      internal only, never published

Supabase (us-west-2)  ───►  Postgres, via the session-mode pooler
```

**Compute on one box, data on Supabase.** The managed-AWS equivalent — RDS +
ElastiCache + ALB — is ~$45/month for this workload before compute, which is two
months of a $100 credit balance. The above is ~$18/month all in: five to six
months. Nothing here needs an RDS failover it will never exercise.

Postgres is Supabase rather than a container because that takes the data off this
instance's EBS volume, which was the one real weakness of a single-box
deployment. Nothing imports a Supabase SDK — it is a `DATABASE_URL` and nothing
more, so moving it elsewhere is a one-variable change.

Patching is `unattended-upgrades`. The instance remains a single point of failure
for *availability*; it is no longer one for *data*.

**The instance region must match the Supabase project's** (`us-west-2`). Every
request makes several queries, so a ~60ms cross-country round trip on each turns
into a visibly slow API.

**Use the SESSION-mode pooler, port 5432.** Transaction mode (6543) silently
breaks prepared statements and drizzle-kit, and the failure reads as an
intermittent query bug rather than a config error.

**Supabase's free tier takes no automated backups.** Daily dumps start on Pro.
`db-backup.yml` is therefore not a belt-and-braces extra — it is the only backup
that exists.

**Redis is not published to the host,** and runs with no auth precisely because
nothing off the compose network can reach it. The production smoke check asserts
6379 is closed from the internet.

## Flow

```
pull request ─────────────► ci.yml
push to master ───────────► ci.yml
                            build both, typecheck frontend, advisory lint
                            NOTHING DEPLOYS on a master push

git tag v* ───────────────► deploy-production.yml
   (or manual dispatch)     ci ─► build image ─► GHCR ─► [approval] ─► ssh deploy ─► Vercel ─► smoke

manual only ──────────────► deploy-staging.yml  only if a staging box exists
manual only ──────────────► db-push.yml         schema change, backs up first
nightly 09:00 UTC ────────► db-backup.yml       pg_dump ─► S3
```

**There is no permanent staging environment, and that is deliberate.** One box
runs one stack (Caddy binds 80/443), so staging means a second instance and
roughly double the burn against a fixed credit balance. Before the app has users,
**the production box is the staging box** — deploy to it, break it, redeploy,
with an audience of nobody. `deploy.sh` rolls back on its own if a deploy fails.

`deploy-staging.yml` is written, tested and dispatch-only, so the day you want a
real staging environment you `terraform apply` a second instance, fill in the
`staging` GitHub Environment, and dispatch it. Nothing in the workflow changes.

**What localhost cannot rehearse**, and therefore what the first production
deploy is proving: the pipeline itself (SSH, scp, compose, rollback), the
`NODE_ENV=production` code paths (`requireCron` fails closed, CORS restricts to
`FRONTEND_URL`), Let's Encrypt issuance through Caddy, Google OAuth on a real
HTTPS callback, and the compiled image on Alpine against Postgres 18 in a
container rather than `ts-node` against a Windows service.

**The image is built once, in CI, and pinned by commit SHA.** Nothing rebuilds
on the server, so the artifact that passed CI is the artifact that runs. `latest`
is never used — that is what makes rollback mean anything.

**`deploy.sh` rolls back on its own.** It records the currently-running image
before switching; if the new one never reports healthy within 120s it restores
the old one and fails the job.

**Production never migrates as part of a deploy.** `drizzle-kit push --force`
auto-approves data-loss statements and this project has no migration history to
roll back to. Staging migrates on every deploy because it is disposable.

---

## What you need to create

### 1. A deploy keypair

```bash
ssh-keygen -t ed25519 -f wagerwolf-deploy -N ""
```

Public half goes into `infra/terraform.tfvars`. Private half becomes the
`SSH_PRIVATE_KEY` GitHub secret. Commit neither — both are gitignored.

### 2. The instance, via Terraform

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # paste the PUBLIC key
terraform init
terraform apply
```

Creates: the EC2 instance, a security group (22/80/443 in), an Elastic IP, an S3
backup bucket, and an IAM instance profile that can write to it. Bootstrap
installs Docker, adds `ubuntu` to the docker group, creates `/opt/wagerwolf`,
adds 2GB of swap, and enables `unattended-upgrades`.

Outputs give you `public_ip` (→ `EC2_HOST`), `backup_bucket` (→ `BACKUP_BUCKET`)
and `instance_id`.

**Set a billing alarm before you do anything else.** AWS Budgets → a $20/month
alert. Credits hide overspend until they run out.

**Provision production only.** Staging, if you ever want it, is a second
`terraform apply` in a separate directory or workspace. To conserve credits,
`aws ec2 stop-instances` it when you are not testing — the Elastic IP keeps its
address and you pay only for storage.

### 3. DNS

Point an A record at the Elastic IP:

```
api.wagerwolf.app     A    <public_ip>
```

Then set `BACKEND_DOMAIN=api.wagerwolf.app` in the env blob below and Caddy
provisions a Let's Encrypt certificate on its own. Before DNS resolves, set
`BACKEND_DOMAIN=:80` to serve plain HTTP.

### 4. Vercel

Root directory `frontend/`, framework Next.js. **Turn off Vercel's own Git
auto-deploy** or every push deploys twice, once past CI and once through it.

Set `NEXT_PUBLIC_API_URL` on the **Production** environment. `vercel build`
reads it from Vercel, so setting it in the workflow does nothing.

If you later add a staging box, set it on **Preview** too — and to a *different*
backend, or staging writes to the production database.

`vercel link` in `frontend/` once locally, then read `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` out of `.vercel/project.json`.

### 5. Google Cloud Console

Register an **Authorized redirect URI** per origin on the OAuth 2.0 Web client:

```
http://localhost:3000/auth/callback
https://<production-domain>/auth/callback
```

Google refuses with `redirect_uri_mismatch` before the chooser appears if the
exact URL is missing. One client can hold several — add the staging origin if
and when it exists.

### 6. GitHub Environments

Settings → Environments → create `production`. Create `staging` only when a
staging box exists; an empty Environment is harmless but the workflow that uses
it is dispatch-only anyway.

**Put a required reviewer on `production`.** That approval prompt is the actual
production gate — without it any `v*` tag ships unattended.

| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP from Terraform |
| `SSH_PRIVATE_KEY` | contents of `wagerwolf-deploy` (the private half) |
| `BACKEND_ENV` | the whole backend env file, see below |
| `VERCEL_TOKEN` | Vercel account token |
| `VERCEL_ORG_ID` | from `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | from `.vercel/project.json` |

| Variable | Value |
|---|---|
| `BACKEND_URL` | `https://api.wagerwolf.app`, no trailing slash |
| `BACKUP_BUCKET` | `backup_bucket` output from Terraform |
| `STAGING_DOMAIN` | *(staging environment only, optional)* domain to alias previews to |

**`BACKEND_ENV` is the entire env file as one secret**, per environment. One
secret rather than a dozen: adding a variable then costs one edit instead of a
workflow edit plus a new secret, and the two drifting apart is the failure this
avoids. `GIT_COMMIT_SHA` and `APP_IMAGE` are appended by the workflow — do not
put them here.

```
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-us-west-2.pooler.supabase.com:5432/postgres
JWT_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
FRONTEND_URL=https://wagerwolf.app,https://wagerwolf.vercel.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SPORTSGAMEODDS_KEY=...
BACKEND_DOMAIN=api.wagerwolf.app
```

Generate `JWT_SECRET` **fresh per environment**. A shared one means a staging
token is a valid production session.

`DATABASE_URL` is the Supabase **session-mode pooler** string (port 5432), from
Project Settings → Database → Connection string. A staging environment needs a
*separate Supabase project*, not the same one — otherwise staging writes to
production data.

---

## First run

1. Billing alarm. Then `terraform apply`.
2. Fill in the `production` GitHub Environment. Leave `staging` empty.
3. `git tag v0.1.0 && git push origin v0.1.0`. Approve when prompted.
   **Expect this one to need a second attempt** — it is the first time any of it
   has run. A failed deploy rolls back and changes nothing.
4. Dispatch `db-push.yml` against **production** to create the schema. It dumps
   the database first, which on an empty database costs nothing.
5. Sign in end to end. This is the first time Google OAuth, Postgres, Redis and
   the BullMQ scheduler run together anywhere.
6. Dispatch `db-backup.yml` by hand to prove the S3 path works, rather than
   finding out at 09:00 the day you need it.
7. Restore that backup into a throwaway database. An untested backup is a
   hypothesis.

Steps 3 and 4 are in that order on purpose: the app boots, fails its startup seed
against an empty database, and restarts until the schema exists. Migrating first
would need a running Postgres, which the deploy is what creates.

---

## Things worth knowing

**Restoring a backup** — from the instance, which carries the S3 role:

```bash
cd /opt/wagerwolf && set -a && . ./.env && set +a
aws s3 cp s3://<bucket>/wagerwolf-<stamp>.sql.gz .
gunzip -c wagerwolf-<stamp>.sql.gz | \
  docker run --rm -i postgres:18-alpine psql "$DATABASE_URL"
```

The dump is `--clean --if-exists`, so it drops before recreating. **A restore has
never been tested.** Do it once against staging — an untested backup is a
hypothesis.

**The odds quota is per-key, not per-environment.** SportsGameOdds bills per
entity, 2500/month, and the poller is tuned to spend ~89% of that in a five-week
month. Two environments on one key will exhaust it. Give staging its own key or
leave `SPORTSGAMEODDS_KEY` unset there.

**Both environments run the full BullMQ scheduler.** Separate boxes means
separate Redis, which keeps them apart. Never point both at one Redis — they
would compete for the same repeatable jobs.

**Redis runs with `--appendonly yes`.** Without it a reboot silently drops every
repeatable job and the season lifecycle stops, with nothing in the logs saying
so.

**Postgres 18 mounts `/var/lib/postgresql`, not `/var/lib/postgresql/data`.**
The image changed this so `pg_upgrade --link` need not cross a mount boundary.
The old path makes 18 refuse to start and report the volume as "unused". Found
by running the stack locally; do not "fix" it back.

**SSH is open to the world** because GitHub-hosted runners have no stable egress
IP. Key-only auth, and the workflow connects as `ubuntu`, never root. To close
it: AWS SSM Session Manager (no inbound port at all) or a self-hosted runner.
Neither is required to launch.

**GHCR login on the box uses the workflow's `GITHUB_TOKEN`,** which expires with
the run. Already-pulled images keep working across reboots; only a rebuilt box
needs a fresh login, which the next deploy provides.

**Two CI jobs are advisory** (`continue-on-error`) and do not block a deploy:

- `backend-typecheck` — 5 real findings (2 in `middleware/rateLimit.ts`,
  3 drizzle relational-query variance in `routes/weeks.routes.ts`)
- `frontend-lint` — 257 errors / 43 warnings, mostly `no-explicit-any` and
  `react-hooks/set-state-in-effect`

Both are red today. Fix them, then delete the `continue-on-error` line — a gate
that has never been green gates nothing.

**There are no tests.** CI proves both projects compile and the image builds. It
does not prove a bet settles correctly. See `LAUNCH_AUDIT.md`.

**No log shipping and no error tracking.** Logs are `docker compose logs` on the
box and nothing else. `LAUNCH_AUDIT.md` #18 is still open, and on a single box
with no aggregation it is more pressing than it was.
