# ── METNMAT chatbot (Bun + Express + Mastra + Groq) → Google Cloud Run ───────
# Cloud Run injects PORT=8080; the app reads process.env.PORT (config.app.port),
# so it binds to 8080 automatically. ALLOWED_ORIGINS / PUBLIC_URL come from env.
FROM oven/bun:1.3 AS base
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .
# No build step: the chat widget's assets (iframe-chat-widget/*/dist) are committed
# and served as static files, and the server runs from TypeScript via `bun run index.ts`.
# (parse:products + build:widget are dev-only — they need a local Excel file and npm,
# neither of which exists in this Bun-only image; the runtime reads products from MongoDB.)

ENV NODE_ENV=production
EXPOSE 8080
CMD ["bun", "run", "index.ts"]
