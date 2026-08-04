/**
 * Parse Metnmat Product_data_sheet_completed.xlsx into metnmat-products.json
 * Run: bun run scripts/parse-metnmat-excel.ts [path-to-xlsx]
 */
import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_XLSX =
  "c:/Users/ritik/Downloads/METNMAT/Product_data_sheet_completed.xlsx";
const OUT_PATH = path.join(PROJECT_ROOT, "metnmat-products.json");

const SHOP_LINK = "https://www.metnmat.com/shop";
const CONTACT_LINK = "https://www.metnmat.com/contact";
const WEBSITE = "https://www.metnmat.com/";
const PHONE_TEL = "tel:+917872686501";
const EMAIL_MAILTO = "mailto:contact@metnmat.com";

const CATEGORY_MAP: Record<string, string> = {
  Electrodes: "electrodes",
  Membranes: "membranes",
  "Reactor & Cell": "reactor_and_cell",
  Equipments: "equipments",
  Accessories: "accessories",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function clean(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\r\n/g, "\n").trim();
}

function splitList(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((x) => x.replace(/^[•\-\*]\s*/, "").trim())
    .filter(Boolean);
}

function isHeaderRow(row: string[]): boolean {
  const c0 = clean(row[0]).toLowerCase();
  return (
    c0.includes("electrode name") ||
    c0 === "name" ||
    c0.startsWith("name ")
  );
}

function isSectionHeader(row: string[]): boolean {
  const c0 = clean(row[0]);
  if (!c0 || isHeaderRow(row)) return false;
  const filled = row.filter((c) => clean(c).length > 0).length;
  return filled <= 2 && !clean(row[1]) && !clean(row[2]);
}

function parseElectrodesLayout(
  rows: string[][],
  category: string,
  products: MetnmatProduct[]
) {
  let subcategory = "";
  let currentName = "";
  let variantIndex = 0;

  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    if (isSectionHeader(row)) {
      subcategory = clean(row[0]);
      currentName = "";
      variantIndex = 0;
      continue;
    }

    const name = clean(row[0]);
    const typeOrMaterial = clean(row[1]);
    const size = clean(row[2]);
    const description = clean(row[3]);
    const application = clean(row[4]);
    const specification = clean(row[5]);
    const includes = clean(row[6]);
    const sku = clean(row[7]);
    const price = clean(row[8]);

    if (!description && !name) continue;

    if (name) {
      currentName = name;
      variantIndex = 0;
    } else if (!currentName) continue;

    variantIndex += 1;
    const title = currentName;
    const variantLabel = [typeOrMaterial, size].filter(Boolean).join(" — ") || "Standard";
    const idBase = sku || slugify(`${title}-${typeOrMaterial}-${size}`);
    const id = idBase ? slugify(idBase) : slugify(`${title}-${variantIndex}`);

    products.push(
      buildProduct({
        id,
        title,
        category,
        subcategory,
        description: description || title,
        specification,
        application,
        includes,
        sku,
        price,
        variants: [variantLabel],
        bodyMaterial: typeOrMaterial,
      })
    );
  }
}

/** Name | Body Material | Description | Specification | Application | Product Includes | SKU | Price */
function parseMembranesLayout(
  rows: string[][],
  category: string,
  products: MetnmatProduct[]
) {
  let subcategory = "";

  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    if (isSectionHeader(row)) {
      subcategory = clean(row[0]);
      continue;
    }

    const name = clean(row[0]);
    if (!name) continue;

    const bodyMaterial = clean(row[1]);
    const description = clean(row[2]);
    const specification = clean(row[3]);
    const application = clean(row[4]);
    const includes = clean(row[5]);
    const sku = clean(row[6]);
    const price = clean(row[7]);

    if (!description && !specification) continue;

    const id = sku ? slugify(sku) : slugify(name);
    products.push(
      buildProduct({
        id,
        title: name,
        category,
        subcategory,
        description: description || name,
        specification,
        application,
        includes,
        sku,
        price,
        variants: bodyMaterial ? [bodyMaterial] : [],
        bodyMaterial,
      })
    );
  }
}

/** Name | Description | Specification | Features | Application | What's in Box | SKU | Price */
function parseReactorLayout(
  rows: string[][],
  category: string,
  products: MetnmatProduct[]
) {
  let subcategory = "";

  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    if (isSectionHeader(row)) {
      subcategory = clean(row[0]);
      continue;
    }

    const name = clean(row[0]);
    if (!name) continue;

    const description = clean(row[1]);
    const specification = clean(row[2]);
    const features = clean(row[3]);
    const application = clean(row[4]);
    const includes = clean(row[5]);
    const sku = clean(row[6]);
    const price = clean(row[7]);

    if (!description && !specification) continue;

    const id = sku ? slugify(sku) : slugify(name);
    products.push(
      buildProduct({
        id,
        title: name,
        category,
        subcategory,
        description: description || name,
        specification,
        application,
        includes,
        sku,
        price,
        variants: [],
        bodyMaterial: "",
        features,
      })
    );
  }
}

/** Name | (empty) | Description | Specification | Features | Application | SKU | Price */
function parseEquipmentsLayout(
  rows: string[][],
  category: string,
  products: MetnmatProduct[]
) {
  let subcategory = "";

  for (const row of rows) {
    if (isHeaderRow(row)) continue;
    if (isSectionHeader(row)) {
      subcategory = clean(row[0]);
      continue;
    }

    const name = clean(row[0]);
    if (!name) continue;

    const description = clean(row[2]);
    const specification = clean(row[3]);
    const features = clean(row[4]);
    const application = clean(row[5]);
    const sku = clean(row[6]);
    const price = clean(row[7]);

    if (!description && !specification) continue;

    const id = sku ? slugify(sku) : slugify(name);
    products.push(
      buildProduct({
        id,
        title: name,
        category,
        subcategory,
        description: description || name,
        specification,
        application,
        includes: "",
        sku,
        price,
        variants: [],
        bodyMaterial: "",
        features,
      })
    );
  }
}

interface BuildInput {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  description: string;
  specification: string;
  application: string;
  includes: string;
  sku: string;
  price: string;
  variants: string[];
  bodyMaterial: string;
  features?: string;
}

interface MetnmatProduct {
  id: string;
  title: string;
  brand: string;
  tagline?: string;
  subcategory?: string;
  marketing_description?: string;
  variants: string[];
  category: string;
  key_features: string[];
  description: string;
  common_uses: string[];
  specifications?: string;
  sku?: string;
  price?: string;
  body_material?: string;
  product_includes?: string;
  product_purchase_link: { platform: string; link: string }[];
  product_image_link?: string;
}

function buildProduct(input: BuildInput): MetnmatProduct {
  const features = input.features
    ? splitList(input.features)
    : input.specification
      ? splitList(input.specification).slice(0, 8)
      : [];

  return {
    id: input.id,
    title: input.title,
    brand: "Metnmat",
    tagline: input.subcategory || undefined,
    subcategory: input.subcategory || undefined,
    marketing_description: input.description,
    variants: input.variants.filter(Boolean),
    category: input.category,
    key_features: features,
    description: input.description.slice(0, 2000),
    common_uses: splitList(input.application),
    specifications: input.specification || undefined,
    sku: input.sku || undefined,
    price: input.price || undefined,
    body_material: input.bodyMaterial || undefined,
    product_includes: input.includes || undefined,
    product_purchase_link: [
      { platform: "Shop on Metnmat", link: SHOP_LINK },
      { platform: "Contact Sales", link: CONTACT_LINK },
      { platform: "Call Us", link: PHONE_TEL },
      { platform: "Email Us", link: EMAIL_MAILTO },
      { platform: "Website", link: WEBSITE },
    ],
  };
}

function dedupeProducts(products: MetnmatProduct[]): MetnmatProduct[] {
  const seen = new Map<string, MetnmatProduct>();
  for (const p of products) {
    let id = p.id;
    let n = 1;
    while (seen.has(id)) {
      id = `${p.id}-${n++}`;
    }
    seen.set(id, { ...p, id });
  }
  return [...seen.values()];
}

function validateProducts(products: MetnmatProduct[]) {
  const issues: string[] = [];
  let missingSku = 0;
  let badIncludes = 0;

  for (const p of products) {
    if (!p.sku) missingSku += 1;
    if (p.product_includes === p.sku) badIncludes += 1;
    if (!p.description?.trim()) issues.push(`Empty description: ${p.id}`);
  }

  console.log("\n--- Data quality ---");
  console.log(`Total products: ${products.length}`);
  console.log(`Missing SKU: ${missingSku}`);
  console.log(`Includes equals SKU (bad): ${badIncludes}`);
  if (issues.length) console.log("Issues:", issues.slice(0, 10));
}

async function main() {
  const xlsxPath = process.argv[2] || DEFAULT_XLSX;
  const wb = XLSX.readFile(xlsxPath);
  const products: MetnmatProduct[] = [];

  const parsers: Record<string, (rows: string[][], cat: string, out: MetnmatProduct[]) => void> = {
    Electrodes: parseElectrodesLayout,
    Membranes: parseMembranesLayout,
    "Reactor & Cell": parseReactorLayout,
    Equipments: parseEquipmentsLayout,
    Accessories: parseEquipmentsLayout,
  };

  for (const sheetName of wb.SheetNames) {
    const category = CATEGORY_MAP[sheetName] ?? slugify(sheetName);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
    }) as string[][];

    const parser = parsers[sheetName] ?? parseMembranesLayout;
    parser(rows, category, products);
  }

  const unique = dedupeProducts(products);
  validateProducts(unique);

  await Bun.write(OUT_PATH, JSON.stringify(unique, null, 2));
  console.log(`\nWrote ${unique.length} products to ${OUT_PATH}`);

  const byCat: Record<string, number> = {};
  for (const p of unique) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
  }
  console.log("By category:", byCat);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
