# ── METNMAT chatbot (Bun + Express + Mastra + Groq) → Google Cloud Run ───────
# Cloud Run injects PORT=8080; the app reads process.env.PORT (config.app.port),
# so it binds to 8080 automatically. ALLOWED_ORIGINS / PUBLIC_URL come from env.
#
# WHY THIS IS A MULTI-STAGE BUILD
# It used to be a single stage with no build step, on the stated basis that the
# widget's dist folders were "committed". They are not: .gitignore:6 excludes
# `dist` at every level, and `git ls-files | grep dist/` returns nothing. The
# only reason production ever had a chat UI is that .gcloudignore does NOT
# exclude dist, so `gcloud builds submit` uploaded whatever happened to be built
# on one developer's laptop at that moment.
#
# That meant the deployed UI lived in no repository, nobody else could ship it,
# and a clean checkout would have produced an image with no chat interface at
# all. The build now happens here, from source, so the image is reproducible
# from the commit alone.

# ── Stage 1: build the two front-end bundles ────────────────────────────────
# Node rather than Bun for this stage: microbundle and vite are npm-native and
# both packages ship a package-lock.json, so `npm ci` gives an exact,
# reproducible install. The runtime stage stays on Bun.
FROM node:20-alpine AS ui
WORKDIR /build

# Manifests first, so dependency layers cache independently of source edits.
COPY iframe-chat-widget/widget/package.json iframe-chat-widget/widget/package-lock.json ./widget/
COPY iframe-chat-widget/iframe-ui/package.json iframe-chat-widget/iframe-ui/package-lock.json ./iframe-ui/
RUN cd widget && npm ci
RUN cd iframe-ui && npm ci

COPY iframe-chat-widget/widget ./widget
COPY iframe-chat-widget/iframe-ui ./iframe-ui

# Vite inlines VITE_* at BUILD time, so anything the UI needs must be present
# here rather than in the runtime env. Both are optional: an empty VITE_API_URL
# means same-origin requests, which is correct because the API and the iframe
# are served by this one service. VITE_ALLOWED_PARENT_ORIGIN additionally pins
# which page may drive the widget over postMessage.
ARG VITE_API_URL=""
ARG VITE_ALLOWED_PARENT_ORIGIN=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ALLOWED_PARENT_ORIGIN=$VITE_ALLOWED_PARENT_ORIGIN

RUN cd widget && npm run build
RUN cd iframe-ui && npm run build

# Fail the build rather than ship an image whose chat UI silently isn't there —
# which is exactly what the previous Dockerfile could do without noticing.
RUN test -f widget/dist/widget.js || (echo "widget build produced no widget.js" && exit 1)
RUN test -f iframe-ui/dist/index.html || (echo "iframe-ui build produced no index.html" && exit 1)

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM oven/bun:1.3 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

# Built artefacts come from stage 1, never from the upload. These are the two
# paths server.ts serves as static (src/server.ts:21-22).
COPY --from=ui /build/widget/dist    ./iframe-chat-widget/widget/dist
COPY --from=ui /build/iframe-ui/dist ./iframe-chat-widget/iframe-ui/dist

# The server runs from TypeScript via `bun run index.ts`. parse:products and
# seed:products stay dev-only — they need a local Excel file; the runtime reads
# products from MongoDB.
ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "run", "index.ts"]
