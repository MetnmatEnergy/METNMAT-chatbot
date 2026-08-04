/**
 * Language detection and translation module for production use.
 *
 * This is NOT an LLM agent (that would add latency). It wraps the franc-based
 * detection with language memory so returning users continue in their preferred
 * language even when they send short messages like "yes" or "ok".
 *
 * Exported functions:
 * - detectLanguage()       — fast language detection with user memory
 * - translateLabel()       — translate common UI labels for programmatic responses
 * - getLangKey()           — resolve to template language key (English/Hinglish/Hindi)
 */

import { getResponseLanguage, MATCH_USER_LANGUAGE, type ResponseLanguageName } from "../../lib/detect-language";

// ─── Language Keys for Programmatic Responses ────────────────────────────────

export type LangKey = "English" | "Hinglish" | "Hindi";

export function resolveLangKey(lang?: string): LangKey {
    if (!lang) return "English";
    const l = lang.toLowerCase();
    if (l.includes("hindi") && !l.includes("hinglish")) return "Hindi";
    if (l.includes("hinglish")) return "Hinglish";
    return "English";
}

// ─── Translated Labels for Programmatic Messages ─────────────────────────────

const LABELS: Record<LangKey, {
    theKingOfSpices: string;
    availableOn: string;
    linksBelow: string;
    variants: string;
    livePricing: string;
    selectProduct: string;
    buyOn: string;
    notAvailableOn: (platform: string) => string;
    availablePlatforms: string;
}> = {
    English: {
        theKingOfSpices: "The King of Spices",
        availableOn: "Available on",
        linksBelow: "links below!",
        variants: "Variants",
        livePricing: "Live pricing may vary by platform. Please check via the buy link below.",
        selectProduct: "Which product would you like the buy link for?",
        buyOn: "Buy on",
        notAvailableOn: (p) => `Sorry, this product is not available on ${p}.`,
        availablePlatforms: "Available on these platforms instead",
    },
    Hinglish: {
        theKingOfSpices: "Masalon Ka Raja",
        availableOn: "Available on",
        linksBelow: "links neeche hain!",
        variants: "Variants",
        livePricing: "Price platform ke hisaab se alag ho sakti hai. Buy link se check karein.",
        selectProduct: "Kis product ka buy link chahiye?",
        buyOn: "Buy on",
        notAvailableOn: (p) => `Sorry, yeh product ${p} pe available nahi hai.`,
        availablePlatforms: "In platforms pe available hai",
    },
    Hindi: {
        theKingOfSpices: "मसालों का राजा",
        availableOn: "उपलब्ध है",
        linksBelow: "लिंक नीचे हैं!",
        variants: "वेरिएंट्स",
        livePricing: "कीमत प्लेटफ़ॉर्म के अनुसार अलग हो सकती है। नीचे दिए गए लिंक से जांचें।",
        selectProduct: "किस प्रोडक्ट का लिंक चाहिए?",
        buyOn: "यहां खरीदें",
        notAvailableOn: (p) => `क्षमा करें, यह प्रोडक्ट ${p} पर उपलब्ध नहीं है।`,
        availablePlatforms: "इन प्लेटफ़ॉर्म पर उपलब्ध है",
    },
};

export function getLabels(lang?: string) {
    return LABELS[resolveLangKey(lang)];
}

// ─── Language Detection with Memory ──────────────────────────────────────────

/**
 * Detects language from user message, with fallback to stored preference.
 * Short messages ("ok", "yes") can't be reliably detected, so we use the
 * user's stored preference from their profile.
 */
export function detectLanguageWithMemory(
    userMessage: string,
    storedPreference?: string
): ResponseLanguageName | typeof MATCH_USER_LANGUAGE {
    const detected = getResponseLanguage(userMessage);

    // If franc returned a concrete language, use it
    if (detected !== MATCH_USER_LANGUAGE) return detected;

    // For MATCH_USER_LANGUAGE (short English / ambiguous), check stored preference
    if (storedPreference) {
        const lower = storedPreference.toLowerCase();
        if (lower === "hinglish") return "Hinglish";
        if (lower === "hindi") return "Hindi";
    }

    return MATCH_USER_LANGUAGE;
}
