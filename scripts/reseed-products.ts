/**
 * Drop legacy sku index and re-seed full catalog from metnmat-products.json.
 * Run: bun run scripts/reseed-products.ts
 */
import connectToDb from "../src/lib/connect-to-db";
import { ProductModel } from "../src/models/product";
import { seedProductsFromJson } from "../src/lib/seed-products";

async function resetProductCollection() {
  try {
    await ProductModel.collection.drop();
    console.log("[reseed] Dropped products collection");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("ns not found")) {
      throw err;
    }
  }
  await ProductModel.syncIndexes();
}

async function main() {
  await connectToDb();
  await resetProductCollection();

  const { inserted, updated, total } = await seedProductsFromJson();
  console.log(`[reseed] Done: ${inserted} inserted, ${updated} updated (${total} in file)`);
}

main().catch((err) => {
  console.error("Reseed failed:", err);
  process.exit(1);
});
