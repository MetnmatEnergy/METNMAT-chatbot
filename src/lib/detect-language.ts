/**
 * Response-language selection: franc for script-based detection, agent for Latin-script (English vs Hinglish).
 * When franc returns 'eng' we pass MATCH_USER_LANGUAGE so the agent infers from the user message (no brittle marker list).
 */

import { franc } from "franc";

/** Language name we pass to the agent (e.g. "Hindi", "German"). */
export type ResponseLanguageName =
  | "English"
  | "Hindi"
  | "Hinglish"
  | "German"
  | "French"
  | "Spanish"
  | "Portuguese"
  | "Bengali"
  | "Tamil"
  | "Telugu"
  | "Marathi"
  | "Gujarati"
  | "Kannada"
  | "Malayalam"
  | "Punjabi"
  | "Urdu";

/**
 * When franc detects Latin script (e.g. 'eng'), we pass this so the agent detects
 * from the user's last message (English vs Hinglish, etc.) instead of a fixed marker list.
 */
export const MATCH_USER_LANGUAGE = "the same language as the user's last message";

/** ISO 639-3 from franc -> our response language name. eng is not mapped; we use MATCH_USER_LANGUAGE so the agent detects. */
const ISO_TO_RESPONSE: Partial<Record<string, ResponseLanguageName>> = {
  hin: "Hindi",
  deu: "German",
  fra: "French",
  spa: "Spanish",
  por: "Portuguese",
  ben: "Bengali",
  tam: "Tamil",
  tel: "Telugu",
  mar: "Marathi",
  guj: "Gujarati",
  kan: "Kannada",
  mal: "Malayalam",
  pan: "Punjabi",
  urd: "Urdu",
};

/**
 * Use when persisting to DB: only real language names (e.g. "Hindi", "English") are useful.
 * Do not store MATCH_USER_LANGUAGE in the user profile.
 */
export function isStorableLanguage(
  lang: ResponseLanguageName | typeof MATCH_USER_LANGUAGE
): lang is ResponseLanguageName {
  return lang !== MATCH_USER_LANGUAGE;
}

/**
 * Common short English words/phrases that franc misclassifies.
 * If the entire message matches one of these (case-insensitive), we treat it as English.
 */
const SHORT_ENGLISH_WORDS = new Set([
  "hi", "hii", "hiii", "hey", "hello", "heya",
  "ok", "okay", "k", "kk",
  "yes", "no", "nope", "yep", "yeah",
  "thanks", "thank you", "ty", "thx",
  "bye", "goodbye", "cya",
  "good", "great", "nice", "cool", "wow",
  "what", "why", "how", "when", "where",
  "more", "next", "back", "stop", "start",
  "help", "info", "details",
]);

/**
 * Common Hinglish markers — Hindi words commonly written in Latin script.
 * If a Latin-script message contains 2+ of these, we classify as Hinglish.
 */
const HINGLISH_MARKERS = new Set([
  "hai", "hain", "ka", "ki", "ke", "ko", "kya", "kaise", "kaisa", "kaisi",
  "kab", "kaha", "kahan", "kyun", "kyu",
  "mein", "mei", "mujhe", "muje", "apna", "apni", "apne",
  "aur", "ya", "par", "se", "pe", "tak", "bhi", "nahi", "nahin", "na",
  "acha", "accha", "achha", "theek", "thik", "sahi",
  "toh", "to", "paas", "hota", "hoti", "hote", "lagta", "lagti",
  "batao", "bataye", "bataiye", "dikhao", "dikha", "de", "do", "dena", "dedo",
  "chahiye", "chaiye", "lena", "lelo", "karo", "karna", "karni",
  "bhai", "bro", "yaar", "dost",
  "haan", "ji", "nah",
  "wala", "wali", "wale",
  "bohot", "bahut", "boht", "zyada", "thoda", "kam",
  "paisa", "paise", "kitna", "kitne", "kitni",
  "lao", "bhejo", "mangta", "mangti",
  "aapka", "aapki", "aapke", "tumhara", "tumhari", "mera", "meri", "mere",
  "sab", "sabhi", "koi", "kuch",
  "abhi", "pehle", "baad",
  "pata", "kaun", "daal", "sabzi", "roti", "kha", "khana", "peena",
  // Product / commerce Hinglish
  "milega", "milegi", "milte", "milti", "mangwa", "mangwao", "mangwana",
  "kharido", "kharidna", "kharidne", "lena", "lenge", "lelo",
  "bech", "bechte", "bechna",
  "accha", "badiya", "badhiya", "mast",
  "konsa", "kaun", "kaunsa", "kaun sa",
  "baare", "bare", "baarein",
  "isme", "uska", "uski", "uske", "iska", "iski", "iske",
  "woh", "yeh", "ye", "wo",
  "rakho", "rakhna", "daalo", "daalein", "lagao",
  "chalo", "chalega", "chal", "hoga", "hogi",
  "samajh", "samjho", "samjha", "samjhao",
  "dekho", "dekhna", "dekhiye",
  "sunao", "suno", "suniye",
  "pakka", "bilkul",
  "aata", "namak", "masala", "masale", "mirch", "mirchi", "achar", "achaar",
  "ghar", "kaam", "wapis",
]);

/**
 * Returns response language: specific language when franc is confident (non-Latin),
 * Hinglish when Latin-script text contains Hindi markers,
 * or MATCH_USER_LANGUAGE for pure English so the agent infers.
 */
export function getResponseLanguage(userMessage: string): ResponseLanguageName | typeof MATCH_USER_LANGUAGE {
  const trimmed = (userMessage ?? "").trim();
  if (trimmed.length === 0) return "English";

  // Short common English words franc can't reliably detect
  if (SHORT_ENGLISH_WORDS.has(trimmed.toLowerCase())) return MATCH_USER_LANGUAGE;

  const iso = franc(trimmed, { minLength: 1 });
  if (!iso || iso === "und") return "English";

  // Non-Latin scripts: franc is reliable
  if (iso !== "eng") {
    const mapped = ISO_TO_RESPONSE[iso];
    return mapped ?? "English";
  }

  // Latin script detected (eng) — check for Hinglish markers
  const words = trimmed.toLowerCase().split(/[\s,.!?;:]+/).filter(Boolean);
  const hinglishCount = words.filter(w => HINGLISH_MARKERS.has(w)).length;

  // Hinglish detection — relaxed thresholds:
  // 1 marker is enough for short messages (≤8 words), 2+ for longer ones.
  // This ensures most Hinglish messages are correctly detected instead of
  // falling through to MATCH_USER_LANGUAGE (which defaults to English in programmatic paths).
  if (hinglishCount >= 2 || (hinglishCount >= 1 && words.length <= 8)) {
    console.log(`[detect-language] Hinglish detected: ${hinglishCount} markers in "${trimmed}"`);
    return "Hinglish";
  }

  // Pure English
  console.log(`[detect-language] English/MATCH: iso=${iso}, hinglish=${hinglishCount} in "${trimmed}"`);
  return MATCH_USER_LANGUAGE;
}


/**
 * Returns a concrete language name for the issue agent so the model always gets an explicit instruction
 * (e.g. "Your entire reply must be in English"), never a vague "match user language".
 * Uses franc: eng/und -> English, hin -> Hindi, etc.
 */
export function getResponseLanguageForIssue(userMessage: string): ResponseLanguageName {
  const trimmed = (userMessage ?? "").trim();
  if (trimmed.length === 0) return "English";

  const iso = franc(trimmed, { minLength: 1 });
  if (!iso || iso === "und") return "English";

  if (iso === "eng") return "English";

  const mapped = ISO_TO_RESPONSE[iso];
  return mapped ?? "English";
}
