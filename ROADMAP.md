# ROADMAP — METNMAT engineering chatbot

## State of play

This is a Bun/Express service (`src/`, 67 files) wrapping a Mastra agent pipeline — intent classifier → sales agent with a Mongo-backed product tool → optional language formatter — fronted by four channels: a React chat UI in an iframe, WhatsApp Cloud API, Facebook Messenger and Instagram DM. The server-side security work that has already been done is real and should not be redone: the widget JWT is bound to its conversation on both read and write (`src/controllers/widget/widget-controller.ts:99-104`, `:128-135`), agent endpoints fail closed on a missing key (`src/middlewares/require-agent-key.middleware.ts:12-15`), Meta webhooks verify the HMAC (`src/routes/whatsapp.routes.ts:17`, `src/routes/meta-social.routes.ts:17,20`), `assertConfig()` refuses to boot production with a default JWT secret or wildcard CORS (`src/config/env.ts:62-73`), and the iframe is locked to the METNMAT domains by CSP (`src/server.ts:50-55`).

What holds it back is three things, in this order. **(1) The delivery pipeline is not real.** There is no `.git` directory in `C:/Users/ritik/OneDrive/Desktop/Metnmat-customer-agent-main`, no `.github`, no tests, and the Dockerfile explicitly does not build the UI (`Dockerfile:10-13`) — what is live is whatever `npm run build` last produced in one developer's working tree, uploaded by `gcloud builds submit`. Nothing on this roadmap ships reliably until that is fixed. **(2) The widget's fetch layer has no error handling at all** — neither `/widget/session` nor `/widget/message` checks `res.ok` (`iframe-ui/src/hooks/useChat.ts:37`, `:182`), so a 429 from the 20/min limiter or an expired 24h token either bricks the widget on a permanent spinner or silently eats a customer's message. **(3) The widget speaks WhatsApp.** The sales agent is instructed to emit `*asterisks*` and `•` (`src/mastra/agents/sales.agent.ts:92`) into a renderer that is one `<p className="whitespace-pre-wrap">` (`iframe-ui/src/components/MessageBubble.tsx:102-107`), and the whole reply is capped at ~900 characters — so an engineering assistant that retrieves 16 structured product fields renders them as a grey paragraph with stray asterisks in it.

---

## Correcting the brief's stack assumptions

| The brief assumed | Reality (verified) | What that changes about the plan |
|---|---|---|
| Next.js / Vercel / Payload CMS | Bun 1.3 + Express 5 in a single container (`Dockerfile:4,18`), deployed to Cloud Run `asia-south1` via `deploy/deploy-gcp.ps1` (`DEPLOY-GCP.md:1-14`). `render.yaml` is a stale second path. | No RSC, no route handlers, no ISR, no `next/image`, no edge runtime. Anything "streaming" has to be built on Express + SSE by hand. Two deploy descriptors disagree — pick one. |
| Streaming via socket.io | **There is no socket.io and no streaming anywhere.** `socket.io` is a backend dependency with zero imports (`package.json:47`; grep across `src/` finds no `Server(`), `socket.io-client` is a UI dependency with zero imports (`iframe-ui/package.json:19`), and `ClientToServerEvents`/`ServerToClientEvents` (`shared/types.ts:61-68`) are vestigial. The transport is one blocking `POST /widget/message` that returns `[userMsg, agentMsg]` after the full pipeline (`useChat.ts:172-188`, `widget-controller.ts:195-198`). | Reconnection, event ordering and socket cleanup are **non-issues** — delete them from the plan. What is actually missing is `res.ok`, timeouts, cancellation and an error state. Streaming becomes a deliberate MEDIUM project (SSE), not a bug fix. |
| OpenAI | **Groq.** `LLM_MODELS.primary = "groq/llama-3.3-70b-versatile"`, `fast = "groq/llama-3.1-8b-instant"` (`src/config/models.ts:7-9`). The `openai` package is installed and never imported. `assertConfig` requires `GROQ_API_KEY` (`src/config/env.ts:70`). | Model constraints are Groq's, and they already shape the code: no `response_format` alongside tools (`chat-orchestrator.ts:191-197`), a documented free-tier 100k tokens/**day** cap on 70b (`models.ts:6`), and a 12k tokens/min cap that drives the retriever's summary/verbose split (`product-retriever.tool.ts:37-40`). Any "make answers richer" work must budget tokens against that, or upgrade the Groq tier first. |
| Pinecone RAG | **Not wired.** `PINECONE_*` is read into config (`src/config/env.ts:8-12`) and used nowhere; `getEmbeddingModel()` (`src/lib/embedding-model.ts:7`) has zero call sites; `@mastra/rag` and `@mastra/pinecone` are never imported. `.env.example:66` already labels Pinecone "Optional — not required". Retrieval is a Mongo `$regex` `$or` over title/sku/subcategory/description (`product-retriever.tool.ts:96-118`). | Do not plan RAG-tuning work. The retrieval quality lever today is the regex and the category aliases, not embeddings. Vector search is a real option later but it needs an OpenAI key — a new vendor — so it is a decision, not a task. |
| The UI is "a React app" | It is a Vite SPA served from `/chat-widget` **inside a cross-origin iframe** (`src/server.ts:97`), injected by a hand-written loader (`iframe-chat-widget/widget/src/index.js`) that the host site loads on first interaction. | Every host↔UI interaction is `postMessage`, and **both listeners currently accept messages from any origin** (`widget/src/index.js:167`, `useChat.ts:61`), with all four outbound posts using `'*'`. The iframe can't read the host DOM, so theming, navigation and add-to-cart all ride that channel. This is the security surface, not CORS. |
| One product | A multi-channel agent: `channel` is threaded through `processCustomerMessage` (`chat-orchestrator.ts:288,352`) but is only used to filter link types (`chat-orchestrator.ts:143-147`). Output style is WhatsApp for all four channels. | "Improve the chat UI" and "improve the answers" are the same project. Rendering markdown in the bubble without first splitting the output contract per channel just moves the problem. |
| Committed build artifacts | `.gitignore:4-6` and `iframe-ui/.gitignore:14` both exclude `dist`, but `Dockerfile:11-12` says the dists are committed and the image builds nothing. `.gcloudignore` does **not** exclude `dist`, which is the only reason production has a UI at all. And there is no repository — `git status` in the chatbot root returns *not a git repository*. | This is the top of the roadmap. Every UI-side fix below is unshippable-by-anyone-but-one-machine until it is fixed. |

---

## HIGH

Ordered by impact per unit of complexity. The first four are one afternoon in one file.

### H1 — Guard `createSession` on `res.ok`, and add a session error state
**What.** `const data = await res.json()` runs on any status (`iframe-ui/src/hooks/useChat.ts:37-38`). A 429 from the session limiter (`src/routes/widget.routes.ts:9,12`) returns `{error:…}`, which parses fine, so the hook returns `{token: undefined, conversationId: "undefined"}` — truthy. `if (s)` at `:119` passes, it is persisted to localStorage at `:123`, and every later send posts `conversationId: "undefined"` and 401s forever. On a `null` return the effect never retries (its guard `if (!siteKey || current) return` at `:101` reads state that never changed) and `App.tsx:24-33` renders a bare spinner as the entire panel — no header, no close button.
**Why.** A Cloud Run cold start or one office behind a shared NAT hitting 20 sessions/min gives a customer a chat that never loads and cannot be closed from inside.
**Anchor.** `iframe-ui/src/hooks/useChat.ts:32-42`, `:100-126`, `:203`; `iframe-ui/src/App.tsx:24-33`
**Impact 5 · complexity trivial · breakage risk: none** (adds a branch that currently doesn't exist)

### H2 — Block concurrent sends; key the optimistic filter to its own message
**What.** `sendMessage` guards on `!text.trim() || !current || viewingPrevious` and never on `isSending` (`useChat.ts:157`). The quick-reply chips (`QuickReplies.tsx:128`) and welcome buttons (`WelcomeScreen.tsx:41`) call it directly with no disabled state. Each response then runs `prev.filter(m => !m.id.startsWith('temp-'))` (`useChat.ts:185`), which strips **every** pending optimistic message, not just its own.
**Why.** Tapping two chips is normal behaviour; it fires two LLM pipelines and the first to land deletes the second's user bubble, so a reply arrives with no visible question. `isSending` is a single boolean, so the first `finally` also kills the typing indicator while the other call is still running.
**Anchor.** `iframe-ui/src/hooks/useChat.ts:157`, `:185`, `:193`
**Impact 4 · complexity trivial · breakage risk: none**

### H3 — Guard `newChat` against destroying the conversation being read
**What.** The rolling-2 model overwrites `previous` with whatever `current` is, unconditionally (`useChat.ts:129-137`). Two taps of the header pen icon lose the real conversation forever. Worse, `App.tsx:92-96` renders "Start a new chat" as the *only* CTA while you are viewing the previous chat — pressing it drops the chat on screen.
**Why.** For a B2B materials chat the transcript is a selection record. There is no confirmation and no undo, and the button sits one pixel from Close (`ChatHeader.tsx:90-105`).
**Anchor.** `iframe-ui/src/hooks/useChat.ts:129-138`; `iframe-ui/src/App.tsx:95`
**Impact 4 · complexity trivial · breakage risk: low** — an empty-current early-return changes the button's behaviour on an empty chat (deliberately).

### H4 — Index the two hot Mongo collections
**What.** `WidgetMessage` declares no indexes (`src/models/widget/WidgetMessage.ts:4-10`) and is queried as `find({conversation}).sort({createdAt:1}).limit(200)` on every history load (`widget-controller.ts:107-110`). `ConversationMessage` declares none either (`src/models/conversation-messages.ts:49-88`) and is queried as `{"user.phone": {$in:[…]}, createdAt: {$gte}}` sorted descending on **every single message** (`src/lib/utils.ts:32-38`).
**Why.** Two collection scans per turn, on collections that only grow. This is the cheapest latency win available and it gets worse every day it is left.
**Anchor.** `src/models/widget/WidgetMessage.ts:4-10`; `src/models/conversation-messages.ts:49-88`; `src/lib/utils.ts:32-38`
**Impact 4 · complexity trivial · breakage risk: none**

### H5 — Handle a failed send: `res.ok`, a `failed` status, retry, and a timeout
**What.** No `res.ok` check (`useChat.ts:182`), so a 401/429 body is not an array, the `if` is skipped, the optimistic bubble sits there labelled "• Sent" (`MessageBubble.tsx:144`) forever, and the *next* successful send deletes it. The `catch` branch (`:189-191`) is the mirror image: the bubble is removed and nothing replaces it, and `ChatInput.tsx:15` has already cleared the textarea. There is no `AbortController` and no timeout on any of the four fetch call sites (`:32`, `:48`, `:109`, `:172`), and the POST blocks for the whole 10-step agent run (`chat-orchestrator.ts:59,200`).
**Why.** The token expires in 24h (`widget-controller.ts:50`); any tab left open overnight silently stops working. An engineer who types a 200-word spec question and loses it will not retype it.
**Anchor.** `iframe-ui/src/hooks/useChat.ts:172-194`; `iframe-ui/src/components/ChatInput.tsx:12-17`
**Impact 5 · complexity small · breakage risk: low** — needs a new `status` field on `Message` (see M3).

### H6 — Origin-check both `postMessage` listeners; allow-list the navigation scheme
**What.** The loader's handler runs on `www.metnmat.com` and inspects neither `event.origin` nor `event.source` (`widget/src/index.js:167-168`). Its NAVIGATE branch ends in `window.location.assign(dest.href)` for any non-metnmat host (`:206`) — `new URL('javascript:alert(1)')` parses, its hostname isn't in `SITE_HOSTS`, and the assign runs from the loader's own same-origin script. CLOSE_WIDGET, WIDGET_READY and ADD_TO_CART are equally spoofable. The iframe side is symmetric: `useChat.ts:61-93` accepts INIT_WIDGET / THEME_CHANGE / CART_RESULT from anyone and interpolates `event.data.name` and `event.data.error` into **agent-attributed** message text (`:80`, `:87`). All four outbound posts use `'*'` (`useChat.ts:95`, `App.tsx:38`, `MessageBubble.tsx:14`, `:24`).
**Why.** Any other frame or injected script on a METNMAT page can redirect the top-level window or make the assistant appear to say something. CSP `frame-ancestors` is the only thing keeping this defence-in-depth rather than live.
**Anchor.** `iframe-chat-widget/widget/src/index.js:167,192-211`; `iframe-ui/src/hooks/useChat.ts:60-97`
**Impact 5 · complexity small · breakage risk: low** — the loader already computes `ORIGIN` at `:11`; get the comparison right for localhost testing.
**Prerequisite:** H8. A loader change only reaches production through a rebuilt `widget/dist/widget.js`.

### H7 — Put the chatbot under version control, with a lint/typecheck gate
**What.** There is no `.git` in the chatbot root and no `.github`. `pnpm`/`npm run lint` in `iframe-ui` fails today on seven `no-explicit-any` errors (`MessageBubble.tsx:92-112`) and nothing runs it. There are no tests anywhere.
**Why.** A production service with no history, no rollback, no diff review and no CI. Every item on this roadmap is riskier than it needs to be, and the "is the committed dist in sync with src?" question below is unanswerable without it. (I checked mtimes: both dists are currently newer than their sources, so they happen to be in sync — that is luck, not a process.)
**Anchor.** repo root — absence of `.git`, `.github`; `iframe-ui/package.json:9`
**Impact 5 · complexity small · breakage risk: none**
**Ship with H8. Prerequisite for H6 and for everything under MEDIUM that touches the UI.**

### H8 — Make the Docker image build the UI
**What.** `Dockerfile:10-13` states there is no build step and that the dists are committed; both `.gitignore` files exclude `dist`. Editing `iframe-ui/src` has literally no effect on production unless a human remembers to run `npm run build` on the same machine and re-upload. The `build:widget` script exists (`package.json:11`) and never runs in the image. Anyone who deploys from `render.yaml` gets an empty `/chat-widget`.
**Why.** Every UI fix in this document is currently unshippable by anyone else, and the deployed bundle is unversioned and unreproducible.
**Anchor.** `Dockerfile:10-13`; `package.json:11`; `src/server.ts:21-22,92-97`
**Impact 5 · complexity medium · breakage risk: medium** — the widget loader needs `microbundle` under npm (`widget/package.json:8`), which the Bun-only image does not have; this needs a separate node builder stage. Verify `/widget.js` and `/chat-widget/` serve identical bytes before and after.

### H9 — Split the output contract per channel; stop shipping WhatsApp markup to the web
**What.** `sales.agent.ts:92` instructs "*asterisks* for light bold, • for bullets"; `sales.agent.ts:29` prescribes `*[Product Title]*`; `chat-orchestrator.ts:153` builds `*${b.text}*: ${b.url}`; `metnmat-contact.ts:47-52` hard-codes `*Contact Metnmat*`. `formatWhatsAppMessage()` is applied on every channel (`chat-orchestrator.ts:82,99`). The bubble escapes none of it (`MessageBubble.tsx:102-107`). Deterministic repro: the 4th welcome chip sends "How can I contact your sales team?" (`WelcomeScreen.tsx:9`), which matches `CONTACT_KEYWORDS` (`metnmat-contact.ts:55-57`) and returns a bubble reading `*Contact Metnmat*` with the asterisks visible.
**Why.** One of four things a first-time visitor can tap produces a reply that looks like a broken template — on the turn where they're trying to reach a human.
**Anchor.** `src/mastra/agents/sales.agent.ts:91-94`; `src/lib/chat-orchestrator.ts:153`; `src/lib/metnmat-contact.ts:46-52`; `iframe-ui/src/components/MessageBubble.tsx:102`
**Impact 4 · complexity small · breakage risk: medium** — this is the shared pipeline; changing formatting for `channel === 'widget'` must not touch the WhatsApp path. The minimal version (strip `*x*` in the widget branch of `widget-controller.ts:159`) has near-zero blast radius; the correct version varies the agent's OUTPUT STYLE block by channel.
**Prerequisite for M1 (markdown rendering).** Doing M1 first gives you double formatting.

### H10 — Accessibility baseline: the assistant's replies are currently inaudible
**What.** Three ARIA attributes in the whole shipped bundle. `<main>` has no `role="log"` / `aria-live`, so no reply is ever announced (`App.tsx:70`). The send button is icon-only with no accessible name (`ChatInput.tsx:49-55`); lucide-react adds none. The textarea has only a placeholder (`ChatInput.tsx:43`). `TypingIndicator` is three animated divs with no text alternative (`TypingIndicator.tsx:152-169`). The iframe has no `title` (`widget/src/index.js:111-118`) and the document it loads is still `<title>iframe-ui</title>` (`iframe-ui/index.html:7`), so screen readers announce the frame as "iframe-ui".
**Why.** Non-visually the product does not function: you press an unnamed button and hear nothing back, ever. Four of these five are one-line changes.
**Anchor.** `iframe-ui/src/App.tsx:70`; `iframe-ui/src/components/ChatInput.tsx:38-55`; `iframe-ui/src/components/TypingIndicator.tsx:152`; `iframe-chat-widget/widget/src/index.js:113`; `iframe-ui/index.html:7`
**Impact 4 · complexity small · breakage risk: none**

### H11 — The contact-keyword short-circuit swallows real questions
**What.** `isContactIntent()` runs before any agent and returns a canned block for any message matching `\b(call|phone|email|mail|contact|reach|talk to sales|speak to|whatsapp number|mobile number)\b` (`metnmat-contact.ts:55-57`, `chat-orchestrator.ts:310-320`).
**Why.** "Can you email me the datasheet for the Ag/AgCl electrode?" and "who should I contact about a 1400 °C lining?" both get a phone number and no answer. The customer's actual question is discarded before the classifier sees it.
**Anchor.** `src/lib/chat-orchestrator.ts:310-320`; `src/lib/metnmat-contact.ts:55-57`
**Impact 3 · complexity trivial · breakage risk: low** — tighten to messages that are *only* a contact request (short, no product noun), or let the classifier own the intent and keep `ensureContactInMessage` as a post-step.

---

## MEDIUM

### M1 — Render markdown (tables above all) in the bubble
Nothing is installed to do it: `iframe-ui/package.json:12-21` has no react-markdown, remark, rehype or katex. The renderer is one `<p>` (`MessageBubble.tsx:102-107`). For a materials assistant, a three-way property comparison is the highest-value answer shape it can produce and it currently comes out as a run-on paragraph. `react-markdown` + `remark-gfm` with a component map that gives `table` an `overflow-x:auto` wrapper is enough; skip highlighting and math. **Impact 4 · medium · risk: medium** (changes how every historical message renders — old `*asterisks*` become literal `*`, which is why H9 comes first).

### M2 — A `product` payload variant and a real product card
`product-retriever.tool.ts:159-176` returns 16 fields; the orchestrator consumes exactly two (`chat-orchestrator.ts:240-242`, `:250`) and the wire format has nowhere to put the rest (`shared/types.ts:16-36`). SKU, body material, variants, specifications and price are retrieved from Mongo, paraphrased by an LLM into ≤900 chars (`schemas/user-response.ts:10-13`) and rendered as grey text. Add a payload variant, populate it in `widget-controller.ts:159-180` from the `toolProduct` the orchestrator already picks, render a card. No new model calls. **Impact 4 · large · risk: medium.** Depends on M3.

### M3 — One shared types module, keyed to its discriminant
`src/types/widget-types.ts`, `iframe-chat-widget/shared/types.ts` and `iframe-ui/src/shared/types.ts` are byte-identical copies with no import relationship (verified by `diff`). That is exactly how `ButtonAction['action']` ended up as `'url'|'call'` (`shared/types.ts:27`) while `widget-controller.ts:169-175` emits four values — including `'add_to_cart'`, which the entire cart flow depends on and TypeScript believes is impossible (`MessageBubble.tsx:113`). `Message.conversationId` (`shared/types.ts:40`) never arrives from the server either; the Mongo field is `conversation` (`WidgetMessage.ts:5`). Keying the payloads to `Message.type` removes the seven `any` casts and unblocks lint. **Impact 3 · medium · risk: low.** Prerequisite for M2; unblocks H7's lint gate.

### M4 — Move Mastra storage off `:memory:`
`mastra/storage.ts:3-6` is `LibSQLStore({url: ":memory:"})`, with a `DefaultExporter` writing traces into it (`mastra/index.ts:33`). On Cloud Run that means every trace is lost on instance recycle and nothing is shared between instances — the observability config is doing work and producing nothing readable. Either point it at a persistent store or drop the exporter and stop paying for it. **Impact 3 · small · risk: low.**

### M5 — Don't load the iframe until the panel is first opened
`widget/src/index.js:112` sets `iframe.src` during `init()`. The host defers `widget.js` until a real interaction (`chat-widget.tsx:70-88`), but once it loads, the full UI bundle (356 KB JS + 24 KB CSS on disk) downloads immediately for every visitor who moved their mouse, whether or not they ever open the chat. Setting `src` inside the first `toggleChat()` moves that cost to people who actually want it. **Impact 3 · trivial · risk: low** (the WIDGET_READY handshake at `:174-176` already handles late mounting, so ordering is safe).

### M6 — Retention and deletion for widget transcripts
`WidgetVisitor`, `WidgetConversation` and `WidgetMessage` (`src/models/widget/*.ts`) have no TTL, no retention policy and no delete path; `ConversationMessage` likewise. The host site was just reworked for DPDP consent (`chat-widget.tsx:52-61`) and then hands the visitor's chat to a service that keeps it forever with no way to erase it. **Impact 3 · small · risk: low** — a TTL index on `createdAt` plus a documented retention period; agree the period with whoever owns the DPDP notice.

### M7 — Persist the add-to-cart confirmation
The "✅ X has been added to your cart" bubble exists only in React state (`useChat.ts:70-92`) and is wiped by reload, `viewPrevious` (`:145`) or `backToCurrent` (`:153`). A customer who adds a part and comes back sees a transcript where the assistant never acknowledged it, and the checkout links are gone. The failure branch's explanation vanishes too. (`cart-${Date.now()}` at `:75` also collides within a millisecond.) **Impact 3 · medium · risk: low.**

### M8 — Cart button pending state, and use a `<button>`
Cart actions are `<motion.a href="#">` with `preventDefault` (`MessageBubble.tsx:116-125`). The tap fires a postMessage and returns; the host then does a full round trip to `/api/product-by-sku` (`chat-cart-bridge.tsx:28`) before answering. Nothing changes visually in between, and `addToCart` has no idempotency (`chat-cart-bridge.tsx:35`) — so the natural second tap adds the item twice. **Impact 3 · small · risk: low.**

### M9 — Auto-scroll only when the user is at the bottom; focus and Escape
`App.tsx:20-22` scrolls unconditionally on `messages.length` and `isSending`, including on the initial restore of up to 200 messages (`widget-controller.ts:109`) — so reopening smooth-scrolls the whole backlog. Separately: `.focus()` appears zero times in the UI and the loader, there is no Escape handler, and tapping a welcome chip unmounts `WelcomeScreen` (`App.tsx:71`) and dumps focus to `<body>`. **Impact 3 · small · risk: low.**

### M10 — Fix the failing contrast tokens and unify the brand red
`--c-text-faint` is #94a3b8 on white (2.51:1) and #6b7076 on #16181d (3.56:1) — both fail AA, and it is the colour of the composer placeholder (`ChatInput.tsx:44`), the header buttons, the typing dots and the timestamps, where `opacity-70` (`MessageBubble.tsx:142`) drops it further. Three brand reds coexist: `--primary: #d81f26` (`index.css:5`), Tailwind `red-600` used ~15 times, and the launcher's `hsl(357 74% 52%)` (`widget/src/index.js:15`) — the button you click is a different red from the panel it opens. Light-palette values (`ring-red-100/50`, `shadow-red-200/60`, `bg-amber-50`) sit on the dark background, which is the loader's default (`widget/src/index.js:33`). **Impact 3 · medium · risk: low.**

### M11 — Honest presence, and reconnect the dead connection banner
`ChatHeader.tsx:84` asserts "Online · replies in seconds" next to two static green dots (`:77`, `:83`), plus a third welded to the launcher (`widget/src/index.js:124-126`). There is no human, and there is a 10-step agent pipeline behind a possibly-cold Cloud Run instance. Meanwhile `isConnected` is `const true` (`useChat.ts:22`), so the "Connection lost" banner (`App.tsx:64-68`) can never render. This also contradicts the house rule in the main repo's `CLAUDE.md` ("No fabricated content"). **Impact 3 · small · risk: none.**

### M12 — Copy / retry / feedback on assistant messages
Nothing below a bubble but a timestamp (`MessageBubble.tsx:141-145`). No copy (a customer building an RFQ has to text-select inside an iframe), no regenerate, no thumbs. On a retrieval assistant over a live catalogue, feedback is the primary quality signal and it does not exist. Note `isLast` is already declared and plumbed (`MessageBubble.tsx:8`, `App.tsx:82`) and never read — that is the hook. **Impact 3 · medium · risk: low.**

### M13 — Self-host Inter, or drop to the system stack
`index.css:1` is a leading `@import` to fonts.googleapis.com — render-blocking, serial, two extra cross-origin round trips, and it survives into the shipped CSS. It also punches a third-party origin through the consent gate the host site deliberately built (`chat-widget.tsx:52-61`). Five weights are requested; `font-light` is used zero times. **Impact 2 · small · risk: none.**

### M14 — Panel sizing and message grouping
`maxHeight: calc(100vh - 120px)` on a bottom-anchored panel (`widget/src/index.js:99`) leaves ~15px of message list on a landscape phone once the ~240px of fixed chrome is counted, and `100vh` is iOS's *large* viewport, so what overflows off-screen is the header with the close button. Use `dvh`. Separately, every message renders its own 32px avatar and timestamp with no neighbour context (`MessageBubble.tsx:71-78`, `:142`), and `formatTime` emits HH:MM only (`lib/utils.ts:10`) — a session restored three days later says "14:32" with no date. **Impact 3 · small · risk: low.**

### M15 — Streaming, if you decide the wait is the problem
Only after H5. The honest framing: this is not a bug fix, it is replacing the transport. `POST /widget/message` is atomic (`widget-controller.ts:195-198`) and the agent runs up to 10 tool steps (`chat-orchestrator.ts:59,200`) behind three silent dots. The cheap 80% is emitting a step label ("Searching the catalogue…") into the typing bubble; the real version is SSE plus an `AbortController` behind a Stop button. Do **not** reach for socket.io just because it is in `package.json`. **Impact 4 · large · risk: high** — touches the one path every message goes through.

---

## LOW

- **Delete the dead architecture.** `socket.io` (`package.json:47`), `socket.io-client` and `date-fns` (`iframe-ui/package.json:14,19`), `@mastra/pinecone` / `@mastra/rag` / `openai` (all unimported), `getEmbeddingModel()` (`src/lib/embedding-model.ts:7`, zero call sites), `ClientToServerEvents`/`ServerToClientEvents`/`Visitor`/`Conversation`/`SessionResponse`/`InitWidgetEvent` (`shared/types.ts:47-78`), `App.css` in full (`.animate-float`, zero uses, imported at `App.tsx:10`), `--primary-light`/`--bg-gradient`/`--glass-*`/`--text-main`/`--text-muted`/`--premium-shadow` (`index.css:7-14`), `src/assets/react.svg`. ~15% of the surface describes a socket.io streaming architecture that was never built. **Impact 2 · trivial · risk: none.**
- **`widget.agent.ts` is registered and never invoked.** `mastra/index.ts:21` registers `"widget-agent"`; nothing calls `getAgent("widget-agent")` — the widget runs the WhatsApp sales agent (`chat-orchestrator.ts:352`). It also targets `LLM_MODELS.fast`, the 8b model the codebase documents as unreliable for tools (`config/models.ts:3-5`). Either wire it as part of H9 or delete it; leaving it is a trap for the next person. **Impact 2 · trivial · risk: none.**
- **`key={i}` on the message list** (`App.tsx:80`) while the array has elements removed mid-list (`useChat.ts:184-187`) and is wholesale swapped on conversation switch. Every message has a real `id`. **Impact 2 · trivial.**
- **Add an ErrorBoundary.** `main.tsx:6-10` has none; `payload` is `Schema.Types.Mixed` with no validation (`WidgetMessage.ts:8`) and `linkify` assumes a string (`MessageBubble.tsx:31-33`). One malformed stored payload blanks the whole iframe. **Impact 3 · small.**
- **`prefers-reduced-motion` is handled nowhere**, including a `repeat: Infinity` animation that runs for the whole duration of every reply (`TypingIndicator.tsx:161-166`). framer-motion ships `useReducedMotion`. **Impact 2 · small.**
- **Send button vanishes rather than dims** (`ChatInput.tsx:52`, `disabled:opacity-0`) — the composer's most-seen state has no visible send affordance. **Impact 2 · trivial.**
- **Product image uses `object-cover` at `max-h-52` with `alt="Product"`** (`MessageBubble.tsx:94-98`) — centre-crops the geometry a buyer is judging, and contradicts the house convention (fixed 4:3, `object-contain`) recorded in the main repo's `CLAUDE.md`. No dimensions (reflow fights the auto-scroll) and no error fallback. **Impact 2 · small.**
- **Wire Tailwind's `dark:` variant to the `.dark` class.** `useChat.ts:67` toggles `.dark`, which flips the CSS custom properties correctly, but there is no `tailwind.config` and no `@custom-variant`, so the one `dark:` utility in the codebase (`ChatHeader.tsx:72`) follows the visitor's OS instead of the site. One line in `index.css`. **Impact 1 · trivial.**
- **Static quick replies.** `FOLLOWUPS` is five module-level constants shown after every turn forever (`QuickReplies.tsx:110-117`, `App.tsx:99`), including while the bot is typing, and the reply schema has no field to influence them (`schemas/user-response.ts:8-52`). The row is `overflow-x-auto` with hidden scrollbars and no edge fade, so two of the five are invisible at 348px. **Impact 2 · medium.**
- **Small consistency cleanups.** Textarea max height has three disagreeing sources — `120` in JS (`ChatInput.tsx:30`), `max-h-32` = 128px (`:44`), inline `minHeight` (`:46`). `isLoading: !siteKey || (!current && !!siteKey)` reduces to `!siteKey || !current` (`useChat.ts:203`). `• Sent` is asserted from `isUser` alone, including on messages the server rejected (`MessageBubble.tsx:144`). `uppercase tracking-tighter` at 10px (`:142`) applies negative letter-spacing to uppercase text. `iframe-chat-widget/widget/index.js` — the package's declared `main` — is a 0-byte file. **Impact 1 · trivial each.**

---

## Deliberately NOT doing

- **Socket.io reconnection, event-ordering and cleanup work.** There are no sockets. The dependency is unimported on both sides. Deleting it is the correct action; building on it is not.
- **Migrating to Next.js / Vercel / Payload.** The service is a Bun container on Cloud Run with an Express static-file story and a hand-written cross-origin loader. A framework migration buys nothing on this list and invalidates the CSP/iframe/postMessage design that is currently the only thing holding the security surface together.
- **Pinecone / vector RAG, for now.** It is configured and unused, `.env.example:66` already calls it optional, and the catalogue is small enough that a Mongo regex over title/sku/subcategory/description finds things. It also needs an OpenAI key (`embedding-model.ts:15`) — a second LLM vendor. Revisit only when M12's feedback data shows *recall* is the failure mode, rather than the 900-char cap and the missing product card, which are what the evidence currently points at.
- **Syntax highlighting and KaTeX in the bubble.** No customer is pasting code into a refractory-selection chat, and the embed weight is already a measured problem on `/shop`. `remark-gfm` tables are the whole win.
- **A full multi-conversation history UI.** The rolling-2 model is crude but the fix that matters is H3 (stop destroying data), not a conversation list with titles and search — which needs server-side titling, pagination and a delete path, and is a project, not a fix.
- **Rewriting the component tree.** Six components at 27-149 lines each, one level of prop drilling, no god-component, no premature Context, and `tsc -b` clean under a genuinely strict tsconfig (`tsconfig.app.json:20-25`). This part is healthy. All the rot is in `useChat.ts` and `MessageBubble.tsx`; leave the rest alone.
- **Touching the host-site embed** (`METNMAT/apps/website/src/frontend/components/chat/chat-widget.tsx`). Interaction-gated, consent-gated, double-injection guarded, with the reasoning for each choice written at the code including why `scroll` was deliberately excluded. It is the best-engineered file in the whole chat surface. The weight problem it works around is fixed on the widget side (M5), not here.
- **Removing the server-side auth already in place.** The conversation-bound JWT, the fail-closed agent key, the Meta HMAC verification and `assertConfig()` are correct and carry comments explaining the bypasses they closed. Do not refactor them incidentally while doing H9.