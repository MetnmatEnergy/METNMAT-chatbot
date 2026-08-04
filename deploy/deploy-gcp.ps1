<#
  METNMAT → Google Cloud Run — one-shot, idempotent deploy.

  PREREQUISITES (once):
    1) Install gcloud SDK + run:  gcloud auth login
    2) Create a GCP project + enable BILLING
    3) Edit  deploy.config.ps1   and copy  secrets.example.env → secrets.env  (fill it)

  RUN (from this deploy/ folder):
    ./deploy-gcp.ps1                 # full deploy (build + deploy all 3)
    ./deploy-gcp.ps1 -SkipBuild      # redeploy existing images (faster)
    ./deploy-gcp.ps1 -Only website   # build+deploy just one app (website|dashboard|chatbot)
    ./deploy-gcp.ps1 -MigrateMedia   # ONLY copy media Supabase→GCS, then exit

  Safe to re-run; only changed things are updated.
#>
param(
  [switch]$SkipBuild,
  [switch]$MigrateMedia,
  [ValidateSet("website", "dashboard", "chatbot")]
  [string]$Only
)

# NB: "Continue", not "Stop" — gcloud writes progress to stderr even on success,
# which under "Stop" PowerShell would mis-treat as a terminating error. We gate on
# the native exit code ($LASTEXITCODE) in the G() helper instead, plus explicit throws.
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\deploy.config.ps1"

$P      = $Config.Project
$R      = $Config.Region
$REPO   = $Config.Repo
$BUCKET = $Config.Bucket
$AR     = "$R-docker.pkg.dev/$P/$REPO"
$SA     = "$($Config.RunSA)@$P.iam.gserviceaccount.com"

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  $m" -ForegroundColor Green }

# Run a gcloud command and HARD-FAIL on non-zero exit (native exes don't throw on their own).
function G {
  & gcloud @args
  if ($LASTEXITCODE -ne 0) { throw "gcloud $($args -join ' ') failed (exit $LASTEXITCODE)" }
}
# Returns $true if a gcloud 'describe'-style probe succeeds (no throw on miss).
function Exists {
  $eap = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  & gcloud @args *> $null
  $r = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $eap
  return $r
}

# ── Parse secrets.env into a hashtable ───────────────────────────────────────
if (-not (Test-Path $Config.SecretsFile)) {
  throw "Missing $($Config.SecretsFile).  Copy secrets.example.env → secrets.env and fill it in."
}
$SECRETS = @{}
foreach ($line in Get-Content $Config.SecretsFile) {
  $t = $line.Trim()
  if ($t -and -not $t.StartsWith("#") -and $t.Contains("=")) {
    $i = $t.IndexOf("="); $k = $t.Substring(0, $i).Trim(); $v = $t.Substring($i + 1).Trim()
    if ($v) { $SECRETS[$k] = $v }
  }
}

# ── Preflight ────────────────────────────────────────────────────────────────
Step "Preflight"
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud not found on PATH. Install: https://cloud.google.com/sdk/docs/install"
}
$acct = (& gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>$null)
if (-not $acct) { throw "Not logged in. Run: gcloud auth login" }
Ok "authed as $acct"
G config set project $P
G config set run/region $R
Ok "project=$P region=$R"

# ── Media migration shortcut ─────────────────────────────────────────────────
if ($MigrateMedia) {
  Step "Migrate media Supabase → GCS"
  if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "  installing migration deps (npm install)..."
    Push-Location $PSScriptRoot; npm install --silent; Pop-Location
  }
  $env:SUPABASE_S3_ENDPOINT         = $SECRETS["SUPABASE_S3_ENDPOINT"]
  $env:SUPABASE_S3_REGION           = $SECRETS["SUPABASE_S3_REGION"]
  $env:SUPABASE_S3_ACCESS_KEY_ID    = $SECRETS["SUPABASE_S3_ACCESS_KEY_ID"]
  $env:SUPABASE_S3_SECRET_ACCESS_KEY= $SECRETS["SUPABASE_S3_SECRET_ACCESS_KEY"]
  $env:SUPABASE_BUCKET              = $SECRETS["SUPABASE_BUCKET"]
  $env:GCS_BUCKET                   = $BUCKET
  $env:GCS_PROJECT_ID               = $P
  Push-Location $PSScriptRoot; node migrate-media-to-gcs.mjs; Pop-Location
  Write-Host "`nMedia migration complete." -ForegroundColor Green
  return
}

# ── Enable APIs ──────────────────────────────────────────────────────────────
Step "Enable APIs"
G services enable run.googleapis.com cloudbuild.googleapis.com `
  artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com
Ok "APIs enabled"

# ── Artifact Registry ────────────────────────────────────────────────────────
Step "Artifact Registry"
if (Exists artifacts repositories describe $REPO --location $R) {
  Ok "repo '$REPO' exists"
} else {
  G artifacts repositories create $REPO --repository-format docker --location $R `
    --description "METNMAT container images"
  Ok "repo '$REPO' created"
}

# ── GCS bucket for assets (private + uniform access) ─────────────────────────
Step "Asset bucket gs://$BUCKET"
if (Exists storage buckets describe "gs://$BUCKET") {
  Ok "bucket exists"
} else {
  G storage buckets create "gs://$BUCKET" --location $R --uniform-bucket-level-access
  Ok "bucket created (private)"
}

# ── Dedicated runtime service account + least-privilege IAM ───────────────────
Step "Runtime service account"
if (Exists iam service-accounts describe $SA) {
  Ok "SA exists"
} else {
  G iam service-accounts create $Config.RunSA --display-name "METNMAT Cloud Run runtime"
  Ok "SA created"
}
G projects add-iam-policy-binding $P --member "serviceAccount:$SA" `
  --role roles/secretmanager.secretAccessor --condition=None | Out-Null
G storage buckets add-iam-policy-binding "gs://$BUCKET" --member "serviceAccount:$SA" `
  --role roles/storage.objectAdmin | Out-Null
Ok "granted secretAccessor + objectAdmin on bucket"

# ── Secrets → Secret Manager ─────────────────────────────────────────────────
Step "Secrets"
function Set-Secret($name) {
  if (-not $SECRETS.ContainsKey($name)) { return }
  if (-not (Exists secrets describe $name)) {
    G secrets create $name --replication-policy automatic
  }
  # Write via a temp file as UTF-8 WITHOUT BOM. Piping a string to gcloud on
  # PowerShell 5.1 prepends a BOM (EF BB BF), which corrupts every secret value.
  $tmp = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllText($tmp, $SECRETS[$name], (New-Object System.Text.UTF8Encoding($false)))
  G secrets versions add $name --data-file=$tmp
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Ok "set $name"
}
foreach ($k in $SECRETS.Keys) {
  if ($k -like "SUPABASE_*") { continue }   # Supabase = migration-only, not a runtime secret
  Set-Secret $k
}

# Build "ENV=secret:latest,..." for the secrets that actually exist.
function SecretRefs($names) {
  ($names | Where-Object { $SECRETS.ContainsKey($_) } | ForEach-Object { "$_=$_`:latest" }) -join ","
}

# ── Build images ─────────────────────────────────────────────────────────────
function Build-Website  { G builds submit $Config.Monorepo --config "$($Config.Monorepo)\cloudbuild.website.yaml" `
    --substitutions "_REGION=$R,_REPO=$REPO,_SITE_URL=$($Config.SiteUrl),_CMS_URL=$($Config.CmsUrl),_CHATBOT_URL=$($Config.ChatbotUrl)" }
function Build-Dashboard{ G builds submit $Config.Monorepo --config "$($Config.Monorepo)\cloudbuild.dashboard.yaml" `
    --substitutions "_REGION=$R,_REPO=$REPO" }
function Build-Chatbot  { G builds submit $Config.Chatbot --tag "$AR/chatbot:latest" }

# ── Deploy services ──────────────────────────────────────────────────────────
function Deploy-Chatbot {
  $envs = "^##^PUBLIC_URL=$($Config.ChatbotUrl)##ALLOWED_ORIGINS=$($Config.SiteUrl),$($Config.ApexUrl)##FACEBOOK_GRAPH_API_VERSION=v20.0"
  # Chatbot uses its OWN database (metnmat), not the CMS (metnmat_cms) → CHATBOT_MONGODB_URI.
  $sec  = "MONGODB_URI=CHATBOT_MONGODB_URI:latest," + (SecretRefs @("GROQ_API_KEY","JWT_SECRET","Meta_WA_accessToken","Meta_WA_SenderPhoneNumberId","Meta_WA_wabaId","Meta_WA_VerfyToken"))
  G run deploy metnmat-chatbot --image "$AR/chatbot:latest" --region $R `
    --service-account $SA --allow-unauthenticated --port 8080 `
    --set-env-vars $envs --set-secrets $sec
}
function Deploy-Dashboard {
  # CMS_URL is the dashboard's own public origin — the chatbot-sync hook uses it to
  # build absolute /api/media/file/... product-image links for the bot catalog.
  $envs = "WEBSITE_URL=$($Config.SiteUrl),CMS_URL=$($Config.CmsUrl),EMAIL_FROM=$($Config.EmailFrom),GCS_BUCKET=$BUCKET,GCS_PROJECT_ID=$P"
  $sec  = SecretRefs @("MONGODB_URI","PAYLOAD_SECRET","PAYLOAD_PIN_PEPPER","INTERNAL_API_KEY","CMS_OAUTH_KEY","OPEN_EXCHANGE_RATES_APP_ID","RESEND_API_KEY")
  G run deploy metnmat-dashboard --image "$AR/dashboard:latest" --region $R `
    --service-account $SA --allow-unauthenticated --port 8080 --memory 1Gi --cpu 1 `
    --set-env-vars $envs --set-secrets $sec
}
function Deploy-Website {
  $envs = "QUOTE_FROM_EMAIL=$($Config.QuoteFromEmail),QUOTE_NOTIFY_EMAIL=$($Config.QuoteNotifyEmail)"
  # GOOGLE_CLIENT_ID/SECRET enable Google Sign-In; SecretRefs skips them if absent
  # from secrets.env, so the deploy still works before they're provisioned.
  $sec  = SecretRefs @("RAZORPAY_KEY_ID","RAZORPAY_KEY_SECRET","RESEND_API_KEY","INTERNAL_API_KEY","CMS_OAUTH_KEY","OPEN_EXCHANGE_RATES_APP_ID","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET")
  G run deploy metnmat-website --image "$AR/website:latest" --region $R `
    --service-account $SA --allow-unauthenticated --port 8080 `
    --set-env-vars $envs --set-secrets $sec
}

$apps = if ($Only) { @($Only) } else { @("chatbot", "dashboard", "website") }
foreach ($app in $apps) {
  Step "Deploy $app"
  switch ($app) {
    "chatbot"   { if (-not $SkipBuild) { Build-Chatbot };   Deploy-Chatbot }
    "dashboard" { if (-not $SkipBuild) { Build-Dashboard }; Deploy-Dashboard }
    "website"   { if (-not $SkipBuild) { Build-Website };   Deploy-Website }
  }
  Ok "$app deployed"
}

# ── Summary ──────────────────────────────────────────────────────────────────
Step "Service URLs"
G run services list --region $R --format "table(metadata.name, status.url)"

Write-Host @"

NEXT STEPS
  1) (once, if you have existing media) ./deploy-gcp.ps1 -MigrateMedia
  2) Map custom domains (see DEPLOY-GCP.md §7) and add the DNS records Google prints:
       metnmat.com / www → metnmat-website,  admin → dashboard,  chat → chatbot
  3) Smoke-test the *.run.app URLs above, then the real domains once DNS resolves.
"@ -ForegroundColor Yellow
