import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import connectToDb from "../../lib/connect-to-db";
import { ProductModel } from "../../models/product";
import { mergeProductLinks } from "../../lib/metnmat-contact";

export const PRODUCT_CATEGORIES = [
  "electrodes",
  "membranes",
  "reactor_and_cell",
  "equipments",
  "accessories",
] as const;

const CATEGORY_ALIASES: Record<string, string> = {
  electrode: "electrodes",
  electrodes: "electrodes",
  membrane: "membranes",
  membranes: "membranes",
  pem: "membranes",
  aem: "membranes",
  reactor: "reactor_and_cell",
  cell: "reactor_and_cell",
  reactor_and_cell: "reactor_and_cell",
  equipment: "equipments",
  equipments: "equipments",
  pump: "equipments",
  pumps: "equipments",
  accessory: "accessories",
  accessories: "accessories",
};

const SINGLE_CATEGORY_LIMIT = 12;
const ALL_CATEGORIES_LIMIT = 20;

// Groq free tier caps requests at 12k tokens/min. Returning every heavy field for
// 20+ products blows past that, so only send full detail when a FEW products match
// (a specific product question). A category/catalog listing gets concise rows.
const VERBOSE_DETAIL_MAX = 4;

export function normalizeProductCategory(val: unknown): string | undefined {
  if (val == null || typeof val !== "string") return undefined;
  const s = String(val).trim().replace(/[}\\]\"'\s]+$/i, "").trim().toLowerCase();
  if (!s) return undefined;
  if (CATEGORY_ALIASES[s]) return CATEGORY_ALIASES[s];
  const found = PRODUCT_CATEGORIES.find(
    (cat) => s === cat || s.startsWith(cat) || cat.startsWith(s.slice(0, Math.min(s.length, cat.length)))
  );
  return found;
}

export const productRetrieverTool = createTool({
  id: "product-retriever",
  description: `
Fetch Metnmat product info. Call this when the user asks about products, catalog, specifications, SKUs, or how to buy.

**CRITICAL – "All products" / "What do you sell" / full catalog:**
When the user asks for ALL products or the full catalog, call this tool **exactly ONCE** with category: "all" and title: "".

- **category: "all"** – Full catalog across all Metnmat categories.
- **category: electrodes | membranes | reactor_and_cell | equipments | accessories** – Filter by top-level category.
- **title** – Product name, SKU keyword, or technical term (e.g. "Ag/AgCl", "PEM N117", "peristaltic pump"). Use "" when listing a whole category.
  `.trim(),

  inputSchema: z.object({
    title: z
      .string()
      .describe(
        "Product title, SKU, or keyword (case-insensitive). Use empty string when listing a category or all products."
      ),
    category: z
      .string()
      .describe(
        "Use 'all' for full catalog. Otherwise one of: electrodes, membranes, reactor_and_cell, equipments, accessories."
      ),
  }),

  execute: async ({ title, category }) => {
    console.log("[product-retriever] input:", { title, category });
    await connectToDb();

    let cat = normalizeProductCategory(category) ?? category?.trim().toLowerCase();
    const tit = title?.trim();

    const isAllCategories = cat === "all" || (cat === "" && tit === "");

    let filter: Record<string, unknown>;
    let limit: number;

    if (isAllCategories) {
      filter = { category: { $in: [...PRODUCT_CATEGORIES] } };
      limit = ALL_CATEGORIES_LIMIT;
    } else if (cat && PRODUCT_CATEGORIES.includes(cat as (typeof PRODUCT_CATEGORIES)[number])) {
      if (tit) {
        filter = {
          category: cat,
          $or: [
            { title: { $regex: tit, $options: "i" } },
            { sku: { $regex: tit, $options: "i" } },
            { subcategory: { $regex: tit, $options: "i" } },
            { description: { $regex: tit, $options: "i" } },
          ],
        };
      } else {
        filter = { category: cat };
      }
      limit = SINGLE_CATEGORY_LIMIT;
    } else if (tit) {
      filter = {
        $or: [
          { title: { $regex: tit, $options: "i" } },
          { sku: { $regex: tit, $options: "i" } },
          { subcategory: { $regex: tit, $options: "i" } },
          { category: { $regex: tit, $options: "i" } },
          { description: { $regex: tit, $options: "i" } },
        ],
      };
      limit = SINGLE_CATEGORY_LIMIT;
    } else {
      return {
        found: false,
        message:
          "Provide category (use 'all' for full catalog, or electrodes/membranes/reactor_and_cell/equipments/accessories) or a title/SKU keyword.",
      };
    }

    const products = await ProductModel.find(filter).limit(limit).lean();

    if (products.length === 0) {
      return {
        found: false,
        message: "No Metnmat products found matching the given criteria.",
      };
    }

    // Full detail only for small, specific result sets; concise rows for listings
    // (keeps the prompt under Groq's 12k tokens/min cap while listing many products).
    const verbose = products.length <= VERBOSE_DETAIL_MAX;

    return {
      found: true,
      total: products.length,
      detail: verbose ? "full" : "summary",
      products: products.map((p) => {
        // Listing rows are intentionally minimal (title/subcategory/category/sku/price) to
        // keep the prompt small — important on the 8b model's 6k tokens/min cap. Full detail
        // (specs, links, image, etc.) is only returned when a few products match.
        if (!verbose) {
          return {
            title: p.title,
            subcategory: p.subcategory,
            category: p.category,
            sku: p.sku,
            price: p.price,
          };
        }
        const links = mergeProductLinks(p.product_purchase_link as { platform: string; link: string }[]);
        return {
          title: p.title,
          tagline: p.tagline,
          subcategory: p.subcategory,
          category: p.category,
          sku: p.sku,
          price: p.price,
          brand: p.brand,
          marketing_description: p.marketing_description,
          variants: p.variants,
          specifications: p.specifications,
          key_features: p.key_features,
          common_uses: p.common_uses,
          body_material: p.body_material,
          product_includes: p.product_includes,
          product_purchase_link: links,
          product_image_link: p.product_image_link,
        };
      }),
    };
  },
});
