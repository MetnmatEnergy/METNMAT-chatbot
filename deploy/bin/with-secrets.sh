#!/usr/bin/env bash
# Fetch metnmat/prod/* from AWS Secrets Manager into the environment, then exec
# the real process. PM2 invokes this instead of node directly.
#
#   usage: with-secrets.sh node apps/website/server.js
#
# Why a wrapper and not a baked .env file:
#   - nothing durable on disk holds a secret, so a stolen disk image or a stray
#     `tar` of the release directory carries no credentials
#   - rotating a secret takes effect on the next `pm2 reload`, with no redeploy
#   - the build artifact stays credential-free, so it can live in S3 safely
#
# Authentication is the EC2 instance role via the AWS SDK's default credential
# chain. No access key is read, written, or expected — if you find yourself
# adding one here, the instance profile is misconfigured; fix that instead.

set -Eeuo pipefail

SECRET_PREFIX="${SECRET_PREFIX:-metnmat/prod/}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
# Only used to make an error message actionable. Defaulted because this script
# runs under `set -u`, where an unset reference is itself a fatal error — and a
# crash inside the error path is the worst place to have one.
APP_NAME="${APP_NAME:-the app}"

log() { echo "[secrets] $*" >&2; }

[ $# -gt 0 ] || { log "usage: with-secrets.sh <command> [args...]"; exit 64; }

# ── Refuse to inherit variables that mutate production data on boot ─────────
# Both of these are read by the CMS seed, which runs inside onInit on EVERY
# boot — and a PM2 memory restart is a boot. Neither should ever be set on a
# long-running server; they are deliberate, one-off, human-supervised
# operations. Unsetting them here means an entry accidentally left in a shell
# profile, a systemd unit or the PM2 dump cannot quietly delete production
# records at 3am.
#
#   DIRECTOR_RESET=true          → deletes every staff account but the director
#   SEED_PRUNE_PLACEHOLDERS=true → deletes products/categories not in the
#                                  bundled catalogue
for dangerous in DIRECTOR_RESET SEED_PRUNE_PLACEHOLDERS; do
  if [ -n "${!dangerous:-}" ]; then
    log "REFUSING to inherit $dangerous=${!dangerous} — unsetting it."
    log "  This variable deletes production records on boot. If you genuinely"
    log "  intend to run it, do so as a one-off command, never as server config."
    unset "$dangerous"
  fi
done

# ── Load the secrets ───────────────────────────────────────────────────────
# One list call plus batched reads, rather than 22 individual get-secret-value
# calls, to keep boot latency down. Values are held in a shell variable and
# exported; they are never written to disk and never echoed.
log "loading secrets under ${SECRET_PREFIX}* from ${AWS_REGION}"

names="$(aws secretsmanager list-secrets \
  --region "$AWS_REGION" \
  --filters "Key=name,Values=${SECRET_PREFIX}" \
  --max-results 100 \
  --query 'SecretList[].Name' --output text 2>/dev/null || true)"

if [ -z "$names" ]; then
  log "FATAL: no secrets found under ${SECRET_PREFIX}"
  log "  Either the instance role lacks secretsmanager:ListSecrets, or the"
  log "  secrets do not exist in ${AWS_REGION}. Starting without them would"
  log "  boot an app with no database URI, so this fails closed."
  exit 78 # EX_CONFIG
fi

loaded=0
placeholders=""
denied=""
for name in $names; do
  var="${name#"$SECRET_PREFIX"}"
  # Skip anything nested a level deeper (metnmat/prod/foo/bar) — not our shape.
  case "$var" in */*) continue ;; esac

  # stderr is CAPTURED, not discarded. Sending it to /dev/null turned an
  # AccessDenied into an empty string, which this then reported as "is empty —
  # skipping". That is a different problem with a different fix, and the log
  # actively pointed away from the real one: the values were present all along
  # and the instance role simply could not read them.
  errf="$(mktemp)"
  value="$(aws secretsmanager get-secret-value \
    --region "$AWS_REGION" --secret-id "$name" \
    --query SecretString --output text 2>"$errf" || true)"

  if [ -z "$value" ]; then
    if grep -qiE "AccessDenied|not authorized|is not authorized|ExpiredToken" "$errf"; then
      log "DENIED: $var — the role cannot secretsmanager:GetSecretValue on it"
      denied="$denied $var"
    else
      log "WARNING: $var is empty — skipping"
    fi
    rm -f "$errf"
    continue
  fi
  rm -f "$errf"

  # PLACEHOLDER_SET_ME is the literal Terraform writes at secret creation. It
  # is committed to this repository and therefore public. The CMS already
  # refuses to start on it (payload.config.ts assertProductionConfig); flagging
  # it here names every offender at once instead of one per failed boot.
  if [ "$value" = "PLACEHOLDER_SET_ME" ]; then
    placeholders="$placeholders $var"
    continue
  fi

  export "$var=$value"
  loaded=$((loaded + 1))
done

# Names only, never values — the one logging rule that matters here.
log "loaded $loaded secret(s)"

# A placeholder is never exported — the app sees the variable as unset, which is
# the honest representation and lets its own fail-fast decide.
#
# Failing here on ANY placeholder was wrong: metnmat/prod/* is one pool shared by
# the website, the CMS and the WhatsApp worker, so an unpopulated chatbot token
# would have blocked the website from starting over config it never reads. What
# each app actually requires is the app's business, so it declares it.
if [ -n "$placeholders" ]; then
  log "not populated (still PLACEHOLDER_SET_ME), NOT exported:$placeholders"
fi

# REQUIRED_SECRETS is a space-separated list set by the caller (see
# ecosystem.config.cjs). Empty means "trust the application's own startup
# checks" — the website already throws in instrumentation.ts when what it needs
# is absent, and the CMS in assertProductionConfig.
missing_required=""
for req in ${REQUIRED_SECRETS:-}; do
  eval "v=\${$req:-}"
  [ -n "$v" ] || missing_required="$missing_required $req"
done

# Reported BEFORE the generic failure, because it is a different fix: the values
# exist and the role cannot read them, so populating them again changes nothing.
if [ -n "$denied" ]; then
  log "PERMISSION DENIED on:$denied"
  log "  These exist but the instance role cannot GetSecretValue them. Note that"
  log "  ListSecrets and GetSecretValue are separate grants — being able to SEE a"
  log "  secret says nothing about being able to READ it."
  log "  Fix: Bootstrap EC2 -> fix_instance_role=true (applies instance-role-policy.json)."
fi

if [ -n "$missing_required" ]; then
  log "FATAL: required secret(s) missing or still placeholder:$missing_required"
  log "  Populate them in Secrets Manager, then 'pm2 reload $APP_NAME' —"
  log "  no redeploy needed, values are read at process start."
  exit 78
fi

# ── Hand off ───────────────────────────────────────────────────────────────
# exec, so the app becomes PID 1 of this process tree: PM2 signals reach node
# directly and there is no shell sitting between them eating SIGTERM (which
# would turn every graceful reload into a 30-second kill).
exec "$@"
