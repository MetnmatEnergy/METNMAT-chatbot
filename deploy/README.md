# Chatbot deployment — AWS EC2

Deploys `metnmat_customer_agent` to the **shared** METNMAT EC2, alongside three
applications it must never disturb.

```
i-0b7f49ca3e9852d4b  ·  t3.medium  ·  ap-south-1  ·  EIP 15.206.25.71

  3000  command-center dashboard   (separate repo — internal staff tool)
  3100  metnmat.com website        (METNMAT-WEBSITE repo)
  3200  Payload CMS                (METNMAT-WEBSITE repo)
  3002  this chatbot
```

Caddy already routes `chat.metnmat.com → 127.0.0.1:3002` with a valid
certificate, so nothing needs configuring at the edge. Until this app listens,
that hostname returns a clean 502.

**Never run `pm2 restart all` on this instance.** Every command in this
repository names `metnmat-chatbot` or uses `--only`.

---

## Why Bun, and not a Node bundle

Measured, not assumed. `bun build index.ts --target=node` produces a 15 MB
bundle that dies immediately:

```
Error: Cannot find module '@libsql/linux-x64-gnu'
```

`@mastra/libsql` needs a **native** binding, and native `.node` binaries cannot
be inlined into a JS bundle. Shipping the platform package alongside would
probably work, but it would mean running the app in a configuration it has never
run in. The Dockerfile is `FROM oven/bun:1.3` with `CMD ["bun", "run",
"index.ts"]`, and that is how it ran on Cloud Run — so Bun is the tested path.

Bun installs **per user** into `~/.bun`. It does not touch system Node, the
package manager, or the other three apps. Uninstalling is `rm -rf ~/.bun`.

---

## One-time setup

**1. Create a GitHub repository and push.** The repo is currently local-only
(`master`, no remote), and GitHub Actions cannot run without one.

```bash
git remote add origin git@github.com:MetnmatEnergy/metnmat-customer-agent.git
git push -u origin master
```

**2. Install Bun on the instance,** as `ec2-user`:

```bash
curl -fsSL https://bun.sh/install | bash
bun --version    # expect 1.3.x
```

The deploy refuses to run without it rather than failing halfway.

**3. Repository settings** — Settings → Secrets and variables → Actions.
These are per-repository; setting them on METNMAT-WEBSITE does not share them.

| Type | Name | Value |
|---|---|---|
| Secret | `AWS_ACCESS_KEY_ID` | *(or `AWS_DEPLOY_ROLE_ARN` for OIDC — preferred)* |
| Secret | `AWS_SECRET_ACCESS_KEY` | |
| Variable | `EC2_INSTANCE_ID` | `i-0b7f49ca3e9852d4b` |
| Variable | `ARTIFACT_BUCKET` | `metnmat-deploy-artifacts-976134557584` |

**4. Grant the instance role read access to this app's secrets.** The instance
profile is `metnmat-dashboard-profile` → role `metnmat-dashboard-role`. Its
existing inline policy covers `metnmat/prod/*` only, so add
`metnmat/chatbot/*` — `secretsmanager:GetSecretValue` and `DescribeSecret`.
Without it `with-secrets.sh` fails closed and the app never starts.

**5. Create the secrets** under `metnmat/chatbot/` in `ap-south-1`.

### Why its own prefix

The website and CMS share `metnmat/prod/*`, and that pool holds a single
`MONGODB_URI`. This app needs a **different database** — `metnmat`, where its
`agent_usage` / `ai_reply_drafts` / `amazon_*` collections live, while the CMS
needs `metnmat_cms`. Sharing the prefix would guarantee one of them points at
the other's data. That is not hypothetical: `metnmat` already contains stray
Payload version collections from exactly that mistake.

| Secret | Notes |
|---|---|
| `MONGODB_URI` | ⚠ ends `/metnmat` — **not** `metnmat_cms`, which is the CMS's |
| `GROQ_API_KEY` | required — the agent will not start without it |
| `PINECONE_API_KEY` | required |
| `PINECONE_INDEX_NAME`, `PINECONE_NAMESPACE` | |
| `AGENT_API_KEY` | required — authenticates callers to the agent API |
| `JWT_SECRET` | required |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | rate limiting |
| `FACEBOOK_PAGE_ACCESS_TOKEN`, `FACEBOOK_APP_SECRET`, `FACEBOOK_VERIFY_TOKEN`, `FACEBOOK_GRAPH_API_VERSION` | Messenger; optional |
| `INSTAGRAM_APP_SECRET`, `META_APP_SECRET` | optional |
| `WHATSAPP_WEBHOOK_URL` | optional |
| `MONGODB_DNS_SERVERS` | only if Atlas SRV lookup needs overriding |

The five in `REQUIRED_SECRETS` (`pm2/ecosystem.config.cjs`) are checked before
`bun` is exec'd, so a missing one is a single clear log line rather than a crash
loop. The rest are read if present and their features degrade if absent.

`PUBLIC_URL`, `ALLOWED_ORIGINS` and `WIDGET_FRAME_ANCESTORS` are configuration,
not secrets, and live in the PM2 file.

---

## Deploying

**Actions → Deploy chatbot to EC2 → Run workflow.** Manual only — this is the
public chat surface on a box already serving three other applications.

What it does: installs with Bun, builds the widget bundles under Node (vite and
microbundle are npm-native), assembles source + production `node_modules` +
built widgets, uploads to the private S3 bucket, releases over SSM, reloads
`metnmat-chatbot` alone, health-checks `127.0.0.1:3002`, and rolls back on
failure.

The artifact carries a `RELEASE_ID` written last. `release.sh` refuses to swap
without it, so a truncated upload fails safely instead of deploying half an app.

### Verifying

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://chat.metnmat.com/
curl -s https://chat.metnmat.com/widget.js | head -c 200
```

`/widget.js` matters most: `www.metnmat.com` injects exactly that script, so if
it 404s the chat bubble silently never appears on the live site.

### If it fails

`release.sh` rolls back to the previous release and restores that release's
config. The website, CMS and dashboard are never named by any of it. Then:

```bash
pm2 logs metnmat-chatbot --lines 40 --nostream
```

Most likely causes, in order: Bun not installed for `ec2-user`; the instance role
not yet granted `metnmat/chatbot/*`; a required secret missing; `MONGODB_URI`
pointing at the wrong database.
