# ── METNMAT deploy config — EDIT THIS, then run ./deploy-gcp.ps1 ─────────────
# Single source of truth for the deploy. Only secrets go in secrets.env.
$Config = @{
  # GCP
  Project = "metnmat-website"       # your GCP project id
  Region  = "asia-south1"           # Mumbai
  Repo    = "metnmat"               # Artifact Registry repo name
  Bucket  = "metnmat-media-prod"    # GCS bucket for assets (globally unique)
  RunSA   = "payload-storage-sa"    # runtime service account you created (keyless; name only)

  # Repo locations on this machine
  Monorepo = "C:\Users\ritik\OneDrive\Desktop\METNMAT"                       # website + dashboard
  Chatbot  = "C:\Users\ritik\OneDrive\Desktop\Metnmat-customer-agent-main"   # chatbot (this repo)

  # Cross-service URLs (baked into the website image at build time). metnmat.com
  # is live via the Global HTTPS Load Balancer (admin./chat. subdomains too), so
  # the site references the BRANDED domains — no *.run.app leakage in the page.
  SiteUrl    = "https://www.metnmat.com"
  ApexUrl    = "https://metnmat.com"
  CmsUrl     = "https://admin.metnmat.com"
  ChatbotUrl = "https://chat.metnmat.com"

  # Non-secret runtime config (change emails once metnmat.com is verified in Resend)
  QuoteFromEmail   = "METNMAT <onboarding@resend.dev>"
  QuoteNotifyEmail = "sales@metnmat.com"
  EmailFrom        = "METNMAT <onboarding@resend.dev>"

  SecretsFile = "$PSScriptRoot\secrets.env"
}
