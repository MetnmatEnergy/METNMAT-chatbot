import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { updateProfile } from "../../lib/user-profile";

export const updateUserProfileTool = createTool({
  id: "update-user-profile",
  description: `
Update the current user's profile when they share information about themselves. Call this when the user says:
- Where they live (city, e.g. "I'm from Mumbai", "Delhi", "Bangalore") → set city.
- What type of buyer they are: regular customer, retailer (shop/store), or wholesaler → set userType.
- Their business or shop name (for retailers/wholesalers) → set businessName.

Use the current user's phone (from conversation context) as userPhone. Only pass fields the user actually shared; leave others empty.
  `.trim(),

  // OpenAI strict tool schema requires every property in required; optional fields use null.
  inputSchema: z.object({
    userPhone: z.string().min(1).describe("The current user's phone number (from context)."),
    city: z
      .string()
      .nullable()
      .describe("City or location the user mentioned. E.g. Mumbai, Delhi, Bangalore. Use null if not shared."),
    userType: z
      .enum(["customer", "retailer", "wholesaler"])
      .nullable()
      .describe("customer = regular buyer; retailer = shop/store; wholesaler = bulk buyer. Use null if not shared."),
    businessName: z
      .string()
      .nullable()
      .describe("Business or store name if user is retailer/wholesaler. Use null if not shared."),
  }),

  execute: async ({ userPhone, city, userType, businessName }) => {
    console.log("[update-user-profile] input:", { userPhone, city, userType, businessName });
    const updates: { city?: string; userType?: string; businessName?: string } = {};
    if (city?.trim()) updates.city = city.trim();
    if (userType?.trim()) updates.userType = userType.trim();
    if (businessName?.trim()) updates.businessName = businessName.trim();
    if (Object.keys(updates).length === 0) {
      console.log("[update-user-profile] no updates found");
      return { updated: false, message: "No profile fields to update." };
    }
    await updateProfile(userPhone, updates);
    console.log("[update-user-profile] profile updated:", updates);
    return { updated: true, fields: Object.keys(updates) };
  },
});
