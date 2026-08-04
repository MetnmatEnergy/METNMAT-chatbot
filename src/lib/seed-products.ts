import path from "path";

import { ProductModel } from "../models/product";

const JSON_PATH = path.join(process.cwd(), "metnmat-products.json");

export async function seedProductsFromJson(): Promise<{ inserted: number; updated: number; total: number }> {
  const file = Bun.file(JSON_PATH);
  if (!(await file.exists())) {
    console.warn("[seed] metnmat-products.json not found — run: bun run parse:products");
    return { inserted: 0, updated: 0, total: 0 };
  }

  const json = await file.json();
  const products = Array.isArray(json) ? json : [json];
  if (products.length === 0) {
    return { inserted: 0, updated: 0, total: 0 };
  }

  await ProductModel.deleteMany({ brand: { $in: ["Nandi", "Ecavo"] } });

  let inserted = 0;
  let updated = 0;

  for (const doc of products) {
    const result = await ProductModel.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
    if (result.upsertedCount) inserted += 1;
    else if (result.modifiedCount) updated += 1;
  }

  return { inserted, updated, total: products.length };
}

/** Seed catalog on first boot when the collection is empty. */
export async function ensureProductsSeeded(): Promise<void> {
  const count = await ProductModel.countDocuments();
  if (count > 0) {
    console.log(`[seed] ${count} products already in MongoDB — skipping auto-seed`);
    return;
  }

  const { inserted, updated, total } = await seedProductsFromJson();
  if (total === 0) return;

  console.log(`[seed] Auto-seeded catalog: ${inserted} inserted, ${updated} updated (${total} in file)`);
}
