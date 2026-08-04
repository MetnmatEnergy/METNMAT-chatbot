/**
 * Sync the website CMS catalog → the chatbot's MongoDB, so the bot answers from the
 * SAME products the site sells. Re-runnable (replaces the chatbot's products collection).
 *
 * The chatbot retrieves via regex on title/sku/subcategory/category/description and
 * filters by a 5-value `category` enum, so we map the CMS fields into that shape.
 *
 * Run from deploy/ (after `npm install`):
 *   CMS_URL=<dashboard-url> CHATBOT_MONGODB_URI=<...mongodb.net/metnmat> node sync-catalog-from-cms.mjs
 */
import { MongoClient } from "mongodb";

const need = (k) => { const v = process.env[k]; if (!v) { console.error("Missing env " + k); process.exit(1); } return v; };
const CMS = need("CMS_URL").replace(/\/+$/, "");
const URI = need("CHATBOT_MONGODB_URI");
const SITE = (process.env.SITE_URL || "https://www.metnmat.com").replace(/\/+$/, "");

// Map a granular CMS category name → the chatbot's 5-value top-level enum.
function mapCategory(name) {
  const s = (name || "").toLowerCase();
  if (/electrode/.test(s)) return "electrodes";
  if (/membrane|nafion|\bpem\b|\baem\b|\bcem\b|\bbpm\b|ionomer/.test(s)) return "membranes";
  if (/reactor|cell|electroly|stack|fuel|photo|battery/.test(s)) return "reactor_and_cell";
  if (/pump|equipment|fabricat|\bmea\b|press|instrument|machine|system/.test(s)) return "equipments";
  return "accessories";
}
const priceStr = (p, unit) =>
  (typeof p === "number" && p > 0) ? `₹${p.toLocaleString("en-IN")}${unit ? ` / ${unit}` : ""}` : "Request a quote";
const specsStr = (specs) => (specs || []).map((s) => `${s.label}: ${s.value}`).join("; ");
function imageUrl(p) {
  const img = p.images?.[0]?.image;
  if (!img) return undefined;
  if (img.url) return img.url.startsWith("http") ? img.url : CMS + img.url;
  if (img.filename) return `${CMS}/api/media/file/${encodeURIComponent(img.filename)}`;
  return undefined;
}

console.log(`Fetching catalog from ${CMS}/api/products ...`);
const res = await fetch(`${CMS}/api/products?limit=300&depth=2`);
if (!res.ok) { console.error("CMS fetch failed:", res.status); process.exit(1); }
const { docs } = await res.json();
console.log(`Fetched ${docs.length} products.`);

const now = new Date();
const mapped = docs.map((p) => {
  const catName = p.category?.name || "";
  return {
    id: p.slug || String(p.id),
    title: p.name,
    brand: p.brand || "METNMAT",
    tagline: p.shortDesc ? p.shortDesc.split(".")[0].slice(0, 140) : undefined,
    subcategory: catName,
    marketing_description: p.shortDesc || "",
    variants: (p.sizes || []).map((s) => s.label).filter(Boolean),
    category: mapCategory(catName),
    key_features: (p.specs || []).slice(0, 6).map((s) => `${s.label}: ${s.value}`),
    description: p.shortDesc || p.name,
    common_uses: [],
    specifications: specsStr(p.specs),
    sku: p.sku || undefined,
    price: priceStr(p.price, p.unit),
    body_material: undefined,
    product_includes: undefined,
    product_purchase_link: [{ platform: "Metnmat", link: `${SITE}/shop/p/${p.slug}` }],
    product_image_link: imageUrl(p),
    createdAt: now,
    updatedAt: now,
  };
});

const client = new MongoClient(URI);
await client.connect();
const col = client.db().collection("products");
const before = await col.countDocuments();
await col.deleteMany({});
const r = await col.insertMany(mapped, { ordered: false });
const after = await col.countDocuments();
await client.close();

const byCat = mapped.reduce((a, m) => { a[m.category] = (a[m.category] || 0) + 1; return a; }, {});
console.log(`Done. chatbot products: ${before} → ${after} (inserted ${r.insertedCount}).`);
console.log("By category:", Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(", "));
