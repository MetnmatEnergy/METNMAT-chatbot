/**
 * Product context helpers for Metnmat catalog formatting.
 */
import { PRODUCT_CATEGORIES } from "../mastra/tools/product-retriever.tool";

const ALL_CATEGORIES = PRODUCT_CATEGORIES;

export const CATEGORY_LABELS: Record<string, string> = {
  electrodes: "Electrodes",
  membranes: "Membranes",
  reactor_and_cell: "Reactor & Cell",
  equipments: "Equipments",
  accessories: "Accessories",
};

export const CATEGORY_EMOJI: Record<string, string> = {
  electrodes: "⚡",
  membranes: "🧪",
  reactor_and_cell: "🔬",
  equipments: "⚙️",
  accessories: "🧰",
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export { ALL_CATEGORIES };
