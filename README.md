# Metnmat Customer Agent

Full-stack AI chatbot for [Metnmat Research & Innovations](https://www.metnmat.com/) — metallurgy, materials, and electrochemical lab equipment.

## Website integration (metnmat.com)

After the server is running on a **public HTTPS URL**, add this **once** before `</body>` on your site:

```html
<script src="https://YOUR-CHATBOT-SERVER.com/widget.js" data-site-key="metnmat-main"></script>
```

| URL | Purpose |
|-----|---------|
| `/integrate` | Copy-ready embed snippet |
| `/demo` | Live widget test page |
| `/health` | Server status |
| `/widget.js` | Embed script |
| `/chat-widget/` | Chat UI (loaded in iframe automatically) |

Replace `YOUR-CHATBOT-SERVER.com` with your deployed host (e.g. `metnmat-chatbot.onrender.com`).

---

## Quick start (local)

```bash
bun install
cp .env.example .env
# Edit .env — MONGODB_URI, GROQ_API_KEY, Meta tokens

bun run setup          # parse products + build widget (catalog auto-seeds on first server start)
bun run dev            # http://localhost:3001
```

Open **http://localhost:3001/demo** to test the chat button.

### MongoDB Atlas

1. In Atlas → **Network Access** → allow your IP (or `0.0.0.0/0` for cloud deploy).
2. Products load automatically on first boot if the collection is empty (`metnmat-products.json`).

---

## Deploy (Render — recommended)

1. Push this repo to GitHub.
2. [Render](https://render.com) → **New Blueprint** → connect repo (uses `render.yaml`).
3. Set env vars in Render dashboard:
   - `MONGODB_URI`, `GROQ_API_KEY`
   - `Meta_WA_*` (WhatsApp)
   - `PUBLIC_URL` = your Render URL, e.g. `https://metnmat-chatbot.onrender.com`
4. After deploy, set `PUBLIC_URL` and redeploy if needed.
5. Add the embed script to metnmat.com using `/integrate` on your live server.

### Docker

```bash
docker build -t metnmat-chatbot .
docker run -p 3001:3001 --env-file .env metnmat-chatbot
```

---

## Channels

| Channel | Endpoint |
|---------|----------|
| **Web widget** | `/widget.js` + `/chat-widget/` |
| **WhatsApp** | `GET/POST /api/webhook/meta` |
| **Facebook** | `GET/POST /api/webhook/facebook` |
| **Instagram** | `GET/POST /api/webhook/instagram` |

WhatsApp webhook (Meta Developer Console):

- Callback: `https://YOUR-SERVER/api/webhook/meta`
- Verify token: value of `Meta_WA_VerfyToken` in `.env`

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `GROQ_API_KEY` | Yes | Groq API key (`gsk_...`) |
| `JWT_SECRET` | Yes | Random secret for widget sessions |
| `PUBLIC_URL` | Prod | Public HTTPS base URL (for `/integrate` snippet) |
| `PORT` | No | Default `3001` |
| `ALLOWED_ORIGINS` | No | CORS origins, comma-separated (default `*`) |
| `Meta_WA_*` | WhatsApp | Cloud API tokens |

---

## Product catalog

```bash
bun run parse:products   # Excel → metnmat-products.json
bun run seed:products      # Upsert JSON → MongoDB
bun run reseed:products    # Full replace (use after catalog update)
```

Default Excel path: `C:/Users/ritik/Downloads/METNMAT/Product_data_sheet_completed.xlsx`

---

## Contact actions (built-in)

- **Shop**: https://www.metnmat.com/shop
- **Call**: +91-7872686501 / +91-8001838711
- **Email**: contact@metnmat.com
- **Contact**: https://www.metnmat.com/contact

---

## Features

- Product search by name, SKU, category
- Shop / call / email buttons in widget
- Support tickets (create + view)
- English / Hindi / Hinglish
- Metnmat-only catalog (50 products from Excel)
