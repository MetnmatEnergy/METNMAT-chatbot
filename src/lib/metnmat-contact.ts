/** Metnmat company contact — https://www.metnmat.com/ */
export const METNMAT = {
  name: "Metnmat Research & Innovations",
  website: "https://www.metnmat.com/",
  shop: "https://www.metnmat.com/shop",
  contactPage: "https://www.metnmat.com/contact",
  email: "contact@metnmat.com",
  phonePrimary: "+917872686501",
  phoneSecondary: "+918001838711",
  phoneDisplay: "+91-7872686501 / +91-8001838711",
} as const;

/** Base URL of the public website (no trailing slash). */
const SITE_BASE = "https://www.metnmat.com";

/** Public website pages the assistant can guide customers to (real, working links). */
export const SITE_LINKS = [
  { label: "Home", url: `${SITE_BASE}/` },
  { label: "Shop / Catalog", url: `${SITE_BASE}/shop` },
  { label: "About Us", url: `${SITE_BASE}/about` },
  { label: "Services", url: `${SITE_BASE}/services` },
  { label: "Projects", url: `${SITE_BASE}/projects` },
  { label: "Blog", url: `${SITE_BASE}/blog` },
  { label: "Request a Quote", url: `${SITE_BASE}/quote` },
  { label: "Search the site", url: `${SITE_BASE}/search` },
  { label: "Contact", url: `${SITE_BASE}/contact` },
  { label: "My Account", url: `${SITE_BASE}/account` },
  { label: "Cart", url: `${SITE_BASE}/cart` },
  { label: "Wishlist", url: `${SITE_BASE}/wishlist` },
] as const;

/** Newline list of site pages for injecting into the agent's instructions. */
export const SITE_PAGES_BLOCK = SITE_LINKS.map((l) => `- ${l.label}: ${l.url}`).join("\n");

export type PurchaseLink = { platform: string; link: string };

/** Default action links attached to every product (shop + contact channels). */
export const DEFAULT_PURCHASE_LINKS: PurchaseLink[] = [
  { platform: "Shop on Metnmat", link: METNMAT.shop },
  { platform: "Contact Sales", link: METNMAT.contactPage },
  { platform: "Call Us", link: `tel:${METNMAT.phonePrimary}` },
  { platform: "Email Us", link: `mailto:${METNMAT.email}` },
];

/** Plain-text contact block for messages (WhatsApp-safe). */
export const CONTACT_TEXT_BLOCK = `
*Contact Metnmat*
📞 Call: ${METNMAT.phoneDisplay}
✉️ Email: ${METNMAT.email}
🌐 Website: ${METNMAT.website}
🛒 Shop: ${METNMAT.shop}
`.trim();

const CONTACT_KEYWORDS =
  /\b(call|phone|email|mail|contact|reach|talk to sales|speak to|whatsapp number|mobile number)\b/i;

export function isContactIntent(text: string): boolean {
  return CONTACT_KEYWORDS.test(text ?? "");
}

export function ensureContactInMessage(message: string): string {
  if (!message) return CONTACT_TEXT_BLOCK;
  const hasPhone = message.includes("7872686501") || message.includes("8001838711");
  const hasEmail = message.includes(METNMAT.email);
  if (hasPhone && hasEmail) return message;
  return `${message.trim()}\n\n${CONTACT_TEXT_BLOCK}`;
}

/** WhatsApp CTA buttons require https — filter tel/mailto for WA, keep for widget. */
export function linksForWhatsApp(links: PurchaseLink[]): PurchaseLink[] {
  return links.filter((l) => l.link.startsWith("http"));
}

export function mergeProductLinks(existing?: PurchaseLink[]): PurchaseLink[] {
  const merged = [...(existing ?? [])];
  for (const def of DEFAULT_PURCHASE_LINKS) {
    if (!merged.some((m) => m.platform === def.platform)) {
      merged.push(def);
    }
  }
  return merged.slice(0, 3);
}
