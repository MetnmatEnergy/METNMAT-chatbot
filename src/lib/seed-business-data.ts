import connectToDb from "./connect-to-db";
import { ProductModel } from "../models/product";
import path from "path";
import fs from "fs/promises";

const METNMAT_JSON_PATH = path.join(process.cwd(), "metnmat-products.json");

export async function seedMetnmatProducts(): Promise<number> {
  const raw = await fs.readFile(METNMAT_JSON_PATH, "utf-8");
  const products = JSON.parse(raw) as Record<string, unknown>[];
  const metnmat = products.filter((p) => (p.brand as string) === "Metnmat");
  if (metnmat.length === 0) {
    console.warn("[seed-business-data] No Metnmat products in JSON.");
    return 0;
  }

  await ProductModel.deleteMany({ brand: { $in: ["Nandi", "Ecavo"] } });

  for (const p of metnmat) {
    await ProductModel.updateOne({ id: p.id }, { $set: p }, { upsert: true });
  }
  console.log(`[seed-business-data] Upserted ${metnmat.length} Metnmat products.`);
  return metnmat.length;
}

/**
 * Seed MongoDB with Metnmat products from metnmat-products.json.
 * Run: bun run scripts/seed-products.ts
 */
export async function seedBusinessData(): Promise<void> {
  await connectToDb();
  await seedMetnmatProducts();
}
