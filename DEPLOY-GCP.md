# METNMAT → Google Cloud Run — Production Deploy

Deploys all three apps to **Cloud Run** in **asia-south1 (Mumbai)**.
**MongoDB Atlas** stays the database. **Google Cloud Storage** holds media/assets.
Resend, Razorpay, Groq and Open Exchange Rates stay as-is.

```
  metnmat.com / www.metnmat.com  ─►  metnmat-website    (Next.js, standalone)
  admin.metnmat.com              ─►  metnmat-dashboard  (Payload CMS)
  chat.metnmat.com               ─►  metnmat-chatbot    (Bun / Express)

  Data:   MongoDB Atlas (unchanged)
  Assets: Google Cloud Storage bucket (private; served via Payload /api/media/file/…)
  Infra:  Artifact Registry · Cloud Build · Secret Manager · dedicated runtime service account
```

---

## ⚡ Quick start (the turnkey path)

Everything is automated by one idempotent script. You only do these steps:

**1. Install gcloud + sign in** (one-time)
- Install: https://cloud.google.com/sdk/docs/install
- Then: `gcloud auth login`

**2. Create a GCP project + enable billing**
- https://console.cloud.google.com/  → new project (note the **project id**)
- https://console.cloud.google.com/billing → link billing (required for Cloud Run/Build)

**3. Configure the deploy** (in `deploy/`)
```powershell
cd C:\Users\ritik\OneDrive\Desktop\Metnmat-customer-agent-main\deploy
notepad deploy.config.ps1                 # set Project = your project id (+ check Bucket is unique)
Copy-Item secrets.example.env secrets.env
notepad secrets.env                       # paste your REAL / rotated secret values
```

**4. Deploy**
```powershell
.\deploy-gcp.ps1
```
That builds all three images and deploys all three services. It prints each
`*.run.app` URL at the end. Re-run any time — it's idempotent.

**5. Migrate existing media** (one-time, if you have product images in Supabase)
```powershell
gcloud auth application-default login      # lets the migration write to GCS
.\deploy-gcp.ps1 -MigrateMedia
```

**6. Map your domains** → see [§ Domains](#-custom-domains--dns) below.

Common re-runs:
```powershell
.\deploy-gcp.ps1 -SkipBuild        # redeploy existing images (config/secret change)
.\deploy-gcp.ps1 -Only website     # build + deploy just one app
```

---

## What the script does (so nothing is a black box)
Run from `deploy/`, `deploy-gcp.ps1`:
1. Verifies gcloud is installed + you're authed; sets project & region.
2. Enables APIs: run, cloudbuild, artifactregistry, secretmanager, storage.
3. Creates the Artifact Registry repo (if missing).
4. Creates the **private** GCS bucket with uniform access (if missing).
5. Creates a **dedicated runtime service account** and grants it least privilege:
   `secretmanager.secretAccessor` + `storage.objectAdmin` on the bucket only.
6. Pushes every value from `secrets.env` into Secret Manager (Supabase keys are
   treated as migration-only and never deployed as runtime secrets).
7. Builds the 3 images via Cloud Build (no local Docker needed).
8. Deploys the 3 Cloud Run services with env + secret references + the dedicated SA.

### How media lands on GCS (no code change)
`apps/dashboard/src/payload.config.ts` auto-detects the storage provider:
Supabase vars present → Supabase; **else** `GCS_BUCKET` + `GCS_PROJECT_ID` present → **GCS**;
else local disk. The script sets `GCS_BUCKET`/`GCS_PROJECT_ID` on the dashboard and
**omits** the Supabase vars, so Payload writes/reads media on GCS. On Cloud Run the
GCS client authenticates via the dedicated service account (no key file). The bucket
stays **private** — Payload streams files through `admin.metnmat.com/api/media/file/…`,
so the website needs no change.

---

## 🗂 Media migration (Supabase → GCS), one-time
Your seed creates only text data; product images live in the Supabase bucket. Copy
them to GCS once so they don't 404 after the switch:
```powershell
gcloud auth application-default login
.\deploy-gcp.ps1 -MigrateMedia
```
This installs the helper deps in `deploy/`, then copies every object key-for-key
(idempotent — re-runnable, skips files already in GCS). Requires the `SUPABASE_S3_*`
values in `secrets.env`. New uploads after cutover go straight to GCS automatically.

---

## 🌐 Custom domains & DNS (metnmat.com)
After the first deploy, map each subdomain and add the DNS records Google prints:
```powershell
$R = "asia-south1"
gcloud beta run domain-mappings create --service metnmat-website   --domain www.metnmat.com   --region $R
gcloud beta run domain-mappings create --service metnmat-website   --domain metnmat.com       --region $R
gcloud beta run domain-mappings create --service metnmat-dashboard --domain admin.metnmat.com --region $R
gcloud beta run domain-mappings create --service metnmat-chatbot   --domain chat.metnmat.com  --region $R
```
- Add the CNAME records (apex `metnmat.com` uses A/AAAA records) at your registrar.
- TLS certs auto-provision (minutes → a couple of hours).
- If `asia-south1` rejects domain mappings, use a **Global External Load Balancer**
  or front it with **Cloudflare** — ask and I'll provide that variant.

---

## ✅ Production checklist (before announcing)
- [ ] **Secrets rotated** — every value that passed through chat; old ones revoked.
      Keep `PAYLOAD_PIN_PEPPER = 5970` (staff PINs depend on it).
- [ ] **Media migrated** to GCS and product images load on the live site.
- [ ] **Razorpay**: KYC → live keys (`rzp_live_…`) → enable **International** → add a **webhook**.
- [ ] **Google Sign-In**: create a *Web* OAuth client (Authorized redirect URI
      `https://www.metnmat.com/api/account/google/callback`), put `GOOGLE_CLIENT_ID` +
      `GOOGLE_CLIENT_SECRET` in `secrets.env`, then `./deploy-gcp.ps1 -Only website`.
- [ ] **Resend**: verify **metnmat.com**, then set `EMAIL_FROM` / `QUOTE_FROM_EMAIL` to
      `…@metnmat.com` (test mode only emails the account owner).
- [ ] **Chatbot data**: reconcile the bot's Mongo catalog (234) with the CMS catalog (68).
- [ ] Test the live money path: shop → cart → checkout → pay → confirmation email.
- [ ] `/admin` PIN sign-in (5970) works on admin.metnmat.com; chat bubble works on the site.

---

## 🔁 Redeploy after a code change
```powershell
cd deploy
.\deploy-gcp.ps1 -Only website      # rebuilds + redeploys that one app
```

## 🛠 Troubleshooting
- **`gcloud not found`** → install the SDK and open a new PowerShell window.
- **`Not logged in`** → `gcloud auth login` (and `gcloud auth application-default login` for media migration).
- **`PERMISSION_DENIED` enabling APIs / on billing** → billing isn't linked to the project.
- **Website build can't find `apps/website/server.js`** → check `ls .next/standalone` in
  the Cloud Build log and adjust the COPY paths in `Dockerfile.website`.
- **Dashboard build fails on payload-types / importmap** → the Dockerfile already deletes
  `src/payload-types.ts`; never run `payload generate:*` in the image (the committed
  `importMap.js` is used as-is).
- **502 “container failed to listen on PORT”** → service isn't binding `$PORT`. Website +
  chatbot do; the dashboard CMD forces `next start -p ${PORT:-8080}`.
- **Media 404 after switch** → run `.\deploy-gcp.ps1 -MigrateMedia`; confirm the dashboard
  service has `GCS_BUCKET`/`GCS_PROJECT_ID` set and NO `SUPABASE_*` env vars.
- **Logs**: `gcloud run services logs read metnmat-website --region asia-south1 --limit 100`

---

## Appendix — manual equivalents
Prefer the script, but if you want to run a single piece by hand, the building blocks are:
```powershell
# build one image
gcloud builds submit "C:\Users\ritik\OneDrive\Desktop\METNMAT" --config "...\cloudbuild.website.yaml" --substitutions "_REGION=asia-south1,_REPO=metnmat"
# create/rotate one secret
"VALUE" | gcloud secrets versions add SECRET_NAME --data-file=-
# deploy one service (see the script's Deploy-* functions for the exact env/secret flags)
gcloud run deploy metnmat-website --image asia-south1-docker.pkg.dev/PROJECT/metnmat/website:latest --region asia-south1
```
