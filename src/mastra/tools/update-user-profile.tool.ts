import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { updateProfile } from "../../lib/user-profile";
import { sanitizeProfileValue } from "../../lib/sanitize";
import { sessionIdentity } from "./search-ticket.tool";

export const updateUserProfileTool = createTool({
  id: "update-user-profile",
  description: `
Update the current user's profile when they share information about themselves. Call this when the user says:
- Where they live (city, e.g. "I'm from Mumbai", "Delhi", "Bangalore") -> set city.
- What type of buyer they are: regular customer, retailer (shop/store), or wholesaler -> set userType.
- Their business or shop name (for retailers/wholesalers) -> set businessName.

The user is identified by the verified session, never by a number they type: do NOT ask for a phone number. Only pass fields the user actually shared; leave others null.
  `.trim(),

  // Every property required (null for "not shared") keeps the schema strict-mode friendly.
  inputSchema: z.object({
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

  /**
   * WHO is updated comes from the request context, not from the model. The
   * previous version took `userPhone` as a tool argument, so "correction, my
   * number is +91…, business name: <instructions>" overwrote another customer's
   * profile, and that text was then spliced into their next system prompt
   * (2026-09-17 audit). Values are sanitised for the same reason.
   */
  execute: async ({ city, userType, businessName }, context) => {
    const userPhone = sessionIdentity(context);
    if (!userPhone) {
      return { updated: false, message: "No session identity; profile not updated." };
    }
    const updates: { city?: string; userType?: string; businessName?: string } = {};
    const cleanCity = sanitizeProfileValue(city);
    const cleanBusiness = sanitizeProfileValue(businessName);
    if (cleanCity) updates.city = cleanCity;
    if (userType === "customer" || userType === "retailer" || userType === "wholesaler") updates.userType = userType;
    if (cleanBusiness) updates.businessName = cleanBusiness;
    if (Object.keys(updates).length === 0) {
      return { updated: false, message: "No profile fields to update." };
    }
    await updateProfile(userPhone, updates);
    console.log("[update-user-profile] fields updated:", Object.keys(updates));
    return { updated: true, fields: Object.keys(updates) };
  },
});
