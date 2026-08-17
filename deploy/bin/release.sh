#!/usr/bin/env bash
# Release script — runs ON the EC2 instance, invoked by SSM.
#
# It is uploaded to S3 next to the build artifact and fetched by the SSM
# command, rather than being embedded in the workflow YAML. Embedding shell in
# YAML that is itself JSON-encoded into an SSM parameter means three layers of
# quoting; a single stray quote there fails at deploy time, on the server, with
# a useless error. A file has none of that and can be linted with shellcheck.
#
#   usage: release.sh <git-sha>
#
# Contract with the workflow: s3://$ARTIFACT_BUCKET/$ARTIFACT_PREFIX/<sha>/
# contains $ARTIFACT_NAME. Everything else is derived here.
#
# The dashboard (command-center) shares this server. Nothing below may touch it:
# no `pm2 restart all`, no global installs, no writes outside $APP_ROOT.

set -Eeuo pipefail

SHA="${1:?usage: release.sh <git-sha>}"

APP_NAME="${APP_NAME:-metnmat-website}"
APP_ROOT="${APP_ROOT:-/home/ec2-user/web}"
APP_PORT="${APP_PORT:-3100}"
HEALTH_PATH="${HEALTH_PATH:-/}"
HEALTH_HOST="${HEALTH_HOST:-www.metnmat.com}"
# Space-separated list of acceptable statuses. The website serves 200 at /; the
# CMS is checked at /admin, which also serves 200, but Payload redirects some
# paths and a deploy that is genuinely healthy must not fail on a 3xx. Listing
# them beats hardcoding one and beats accepting anything non-5xx.
HEALTH_OK_CODES="${HEALTH_OK_CODES:-200}"
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:?ARTIFACT_BUCKET not set}"
ARTIFACT_PREFIX="${ARTIFACT_PREFIX:-website}"
ARTIFACT_NAME="${ARTIFACT_NAME:-web-build.tgz}"

# The two files that prove an artifact is complete. They differ per app because
# the two apps have genuinely different shapes: the website ships a Next
# STANDALONE bundle (self-contained server.js), while Payload has no standalone
# output, so the CMS ships `pnpm deploy` output plus .next and is started
# through the next CLI. Parameterised rather than duplicated — one release
# script, two apps, so a fix to the swap or rollback logic cannot land in one
# and be forgotten in the other.
BUILD_ID_PATH="${BUILD_ID_PATH:-apps/website/.next/BUILD_ID}"
APP_ENTRY_PATH="${APP_ENTRY_PATH:-apps/website/server.js}"
# How long to give the app to come up before declaring failure.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-90}"

RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
PREVIOUS="$APP_ROOT/previous"
TARGET="$RELEASES/$SHA"

log() { echo "[release $(date -u +%H:%M:%S)] $*"; }
fail() { echo "[release] FAILED: $*" >&2; exit 1; }

# ── 1. Fetch and unpack BESIDE the live version ────────────────────────────
# Never unpack over $CURRENT. The live app keeps serving from an untouched
# directory for the whole of this step; the swap later is a symlink move.
mkdir -p "$RELEASES"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "downloading artifact for $SHA"
aws s3 cp "s3://$ARTIFACT_BUCKET/$ARTIFACT_PREFIX/$SHA/$ARTIFACT_NAME" "$TMP/$ARTIFACT_NAME" --only-show-errors \
  || fail "artifact download failed — does s3://$ARTIFACT_BUCKET/$ARTIFACT_PREFIX/$SHA/ exist?"

rm -rf "$TARGET"
mkdir -p "$TARGET"
tar -xzf "$TMP/$ARTIFACT_NAME" -C "$TARGET" || fail "artifact did not unpack — truncated upload?"

# ── 2. Verify the artifact is complete BEFORE touching the live symlink ────
# A truncated tar can still extract "successfully". BUILD_ID is written last by
# next build, so its presence is a cheap end-marker; server.js is what PM2 runs.
[ -f "$TARGET/$BUILD_ID_PATH" ]  || fail "$BUILD_ID_PATH missing — artifact is incomplete, refusing to deploy"
[ -e "$TARGET/$APP_ENTRY_PATH" ] || fail "$APP_ENTRY_PATH missing — wrong archive layout"
log "artifact verified (BUILD_ID $(cat "$TARGET/$BUILD_ID_PATH"))"

# ── 2b. Install the runtime config that shipped with this release ──────────
# These live in $APP_ROOT rather than inside the release, because PM2 reads the
# ecosystem file by absolute path and the wrapper must survive a rollback that
# swaps the release directory underneath it. Copying them out on every deploy
# keeps them in step with the code without making them part of the swap.
mkdir -p "$APP_ROOT/bin" "$APP_ROOT/logs"
if [ -d "$TARGET/_deploy" ]; then
  install -m 0644 "$TARGET/_deploy/ecosystem.config.cjs" "$APP_ROOT/ecosystem.config.cjs"
  install -m 0755 "$TARGET/_deploy/with-secrets.sh"      "$APP_ROOT/bin/with-secrets.sh"
  log "runtime config installed from artifact"
else
  # An artifact built before _deploy existed. Only fatal on a first deploy,
  # where there is nothing already on the box to fall back to.
  [ -f "$APP_ROOT/ecosystem.config.cjs" ] \
    || fail "artifact has no _deploy/ and no ecosystem.config.cjs exists — rebuild from a current commit"
  log "artifact predates _deploy/ — keeping the config already on the box"
fi

# ── 3. Record what is live now, so rollback has a target ───────────────────
ROLLBACK_TO=""
if [ -L "$CURRENT" ]; then
  ROLLBACK_TO="$(readlink -f "$CURRENT")"
  ln -sfn "$ROLLBACK_TO" "$PREVIOUS"
  log "previous release recorded: $(basename "$ROLLBACK_TO")"
fi

# ── 4. Swap ────────────────────────────────────────────────────────────────
# ln -sfn onto a temp name then mv is atomic; a plain `ln -sfn` on an existing
# symlink is not, and leaves a window where $CURRENT does not resolve.
ln -sfn "$TARGET" "$CURRENT.tmp"
mv -Tf "$CURRENT.tmp" "$CURRENT"
log "symlink swapped to $SHA"

# ── 5. Reload ONLY this app ────────────────────────────────────────────────
# `pm2 reload <name>` — never `restart all`, which would bounce the dashboard
# and the WhatsApp worker's siblings along with it.
# Always act on the ECOSYSTEM FILE, never on the bare process name.
# `pm2 reload <name>` reuses the definition already registered with the pm2
# daemon and never re-reads ecosystem.config.cjs — so a corrected interpreter,
# script path or NODE_OPTIONS is silently ignored. That is exactly how a stale
# `node_args` survived being fixed on disk and crash-looped two deploys running.
# `--only` keeps every one of these scoped to this app; the dashboard is never
# named, so it cannot be reloaded, restarted or deleted by any of them.
ECO="$APP_ROOT/ecosystem.config.cjs"
[ -f "$ECO" ] || fail "no ecosystem file at $ECO — did the artifact carry _deploy/?"

if pm2 describe "$APP_NAME" 2>/dev/null | grep -qi "online"; then
  log "reloading $APP_NAME from $ECO"
  pm2 reload "$ECO" --only "$APP_NAME" --update-env || fail "pm2 reload failed"
else
  # Not online: either never started, or sitting errored after a crash loop. A
  # broken definition cannot be reloaded out of existence — reload would just
  # re-apply it — so drop it and start clean. Deleting by NAME touches only this
  # app.
  log "$APP_NAME is not online — deleting any stale definition and starting clean"
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 start "$ECO" --only "$APP_NAME" --update-env || fail "pm2 start failed"
fi
pm2 save >/dev/null 2>&1 || true

# ── 6. Health check against LOCALHOST, not the public URL ──────────────────
# Deliberately not https://metnmat.com. Until DNS cuts over, that name still
# resolves to GCP, so checking it would report the OLD stack as healthy and
# mask a completely broken release. The Host header makes the app render as it
# will in production (canonical-host middleware, absolute URLs) while the
# connection stays on the box.
healthy() {
  for want in $HEALTH_OK_CODES; do [ "$1" = "$want" ] && return 0; done
  return 1
}

log "waiting for $APP_NAME on :$APP_PORT$HEALTH_PATH (accept: $HEALTH_OK_CODES, timeout ${HEALTH_TIMEOUT}s)"
deadline=$(( SECONDS + HEALTH_TIMEOUT ))
code=""
until [ "$SECONDS" -ge "$deadline" ]; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "Host: $HEALTH_HOST" "http://127.0.0.1:$APP_PORT$HEALTH_PATH" || true)"
  healthy "$code" && break
  sleep 3
done

if ! healthy "$code"; then
  log "health check FAILED (last status: ${code:-no response})"

  if [ -n "$ROLLBACK_TO" ]; then
    log "rolling back to $(basename "$ROLLBACK_TO")"
    ln -sfn "$ROLLBACK_TO" "$CURRENT.tmp"
    mv -Tf "$CURRENT.tmp" "$CURRENT"

    # Put the PREVIOUS release's runtime config back too. Step 2b installed the
    # new release's config into $APP_ROOT before the health check, so moving the
    # symlink alone would roll back the code while leaving the configuration
    # that may well be what broke it.
    if [ -f "$ROLLBACK_TO/_deploy/ecosystem.config.cjs" ]; then
      install -m 0644 "$ROLLBACK_TO/_deploy/ecosystem.config.cjs" "$APP_ROOT/ecosystem.config.cjs"
      install -m 0755 "$ROLLBACK_TO/_deploy/with-secrets.sh"      "$APP_ROOT/bin/with-secrets.sh"
      log "restored the previous release's runtime config"
    fi

    # From the file, for the same reason as the forward path: a reload by name
    # would re-apply the definition that just failed.
    pm2 reload "$ECO" --only "$APP_NAME" --update-env || true
    sleep 5
    back="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
      -H "Host: $HEALTH_HOST" "http://127.0.0.1:$APP_PORT$HEALTH_PATH" || true)"
    log "post-rollback status: ${back:-no response}"
    healthy "$back" || log "ROLLBACK DID NOT RESTORE SERVICE — manual intervention required"
  else
    log "no previous release to roll back to (first deploy)"
  fi

  echo "--- last 40 lines of $APP_NAME log ---" >&2
  pm2 logs "$APP_NAME" --lines 40 --nostream 2>&1 | tail -40 >&2 || true
  fail "deploy rolled back"
fi

log "health check OK — $SHA is live"

# ── 7. Prune old releases, keep the last 5 for rollback ────────────────────
# Never prune $CURRENT or $PREVIOUS even if they fall outside the window.
keep_current="$(readlink -f "$CURRENT" 2>/dev/null || true)"
keep_prev="$(readlink -f "$PREVIOUS" 2>/dev/null || true)"
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +6 | while read -r old; do
  old="${old%/}"
  [ "$old" = "$keep_current" ] && continue
  [ "$old" = "$keep_prev" ] && continue
  log "pruning old release $(basename "$old")"
  rm -rf "$old"
done

log "done"
