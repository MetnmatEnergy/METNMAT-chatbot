import "dotenv/config";

import connectToDb from "../src/lib/connect-to-db";
import { seedBusinessData } from "../src/lib/seed-business-data";

async function main() {
  await connectToDb();
  await seedBusinessData({
    products: false,
    platformAvailability: true,
    competitor: false,
  });
  console.log("Platform availability seeded successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
