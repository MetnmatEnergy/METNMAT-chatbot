import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import connectToDb from "../../lib/connect-to-db";
import { PlatformAvailabilityModel } from "../../models/platform-availability";

const PLATFORMS = ["blinkit", "zepto", "instamart"] as const;

/**
 * Normalize city for matching: lowercase, trim. Pincode: trim.
 */
function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

export const platformAvailabilityTool = createTool({
  id: "platform-availability",
  description: `
Check which delivery platforms (Blinkit, Zepto, Instamart) serve a given city or pincode.
Call this when you have the user's city and are about to show buy links—only include buttons for platforms returned in availablePlatforms.
- city: required. The user's city (e.g. Mumbai, Delhi, Bangalore). Matching is case-insensitive.
- pincode: optional. If provided, also checks pincode availability; a platform is available if either city OR pincode matches.
Returns availablePlatforms (list of platform ids: blinkit, zepto, instamart) and unavailablePlatforms. If a platform has no data, it is not included in availablePlatforms.
  `.trim(),

  inputSchema: z.object({
    city: z.string().min(1).describe("User's city. E.g. Mumbai, Delhi, Bangalore. Case-insensitive."),
    pincode: z
      .string()
      .nullable()
      .describe("Optional pincode for the user's area. Use null if not known."),
  }),

  execute: async ({ city, pincode }) => {
    console.log("[platform-availability] input:", { city, pincode });
    await connectToDb();

    const cityNorm = normalizeCity(city);
    const pincodeNorm = pincode?.trim() ?? "";

    const docs = await PlatformAvailabilityModel.find({
      platform: { $in: [...PLATFORMS] },
    }).lean();

    console.log("[platform-availability] docs found:", docs.length);

    const availablePlatforms: string[] = [];
    const unavailablePlatforms: string[] = [];

    if (docs.length === 0) {
      console.log("[platform-availability] no data in DB, defaulting to all available");
      return {
        city: cityNorm || city,
        availablePlatforms: [...PLATFORMS],
        unavailablePlatforms: [],
        message: "No platform data in DB; treat all platforms as available. Show all buy links.",
      };
    }

    for (const platform of PLATFORMS) {
      const doc = docs.find((d) => d.platform === platform);
      if (!doc) {
        unavailablePlatforms.push(platform);
        continue;
      }
      const cities: string[] = (doc.cities ?? []).map((c) => normalizeCity(String(c)));
      const pincodes: string[] = (doc.pincodes ?? []).map((p) => String(p).trim());
      const cityMatch = cityNorm && cities.some((c) => c === cityNorm || c.includes(cityNorm) || cityNorm.includes(c));
      const pincodeMatch = pincodeNorm && pincodes.some((p) => p === pincodeNorm);
      if (cityMatch || pincodeMatch) {
        availablePlatforms.push(platform);
      } else {
        unavailablePlatforms.push(platform);
      }
    }

    console.log("[platform-availability] result:", { availablePlatforms, unavailablePlatforms });

    if (availablePlatforms.length === 0) {
      return {
        city: cityNorm || city,
        availablePlatforms: [...PLATFORMS],
        unavailablePlatforms: [],
        message: `City ${city} not in DB; treat all platforms as available. Show all buy links.`,
      };
    }

    return {
      city: cityNorm || city,
      availablePlatforms,
      unavailablePlatforms,
      message:
        availablePlatforms.length > 0
          ? `In ${city}: available on ${availablePlatforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}.`
          : `No delivery in ${city} for Blinkit, Zepto, or Instamart.`,
    };
  },
});
