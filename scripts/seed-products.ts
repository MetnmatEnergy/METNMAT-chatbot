import connectToDb from "../src/lib/connect-to-db";
import { seedProductsFromJson } from "../src/lib/seed-products";

async function seed() {
  await connectToDb();
  const { inserted, updated, total } = await seedProductsFromJson();
  console.log(`Products: ${inserted} inserted, ${updated} updated, ${total} total in file.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
