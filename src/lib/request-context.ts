import { RequestContext } from "@mastra/core/request-context";

import { Intent } from "../constants/intents";

/** User profile snapshot passed into request context for personalization. */
export type WebhookUserProfile = {
  city?: string;
  userType?: string;
  businessName?: string;
  preferredLanguage?: string;
};

/**
 * Request context shape for webhook-driven agent calls.
 * Set in the controller and read by agents via dynamic instructions.
 */
export type WebhookRequestContext = {
  userName: string;
  userPhone: string;
  intent?: string;
  isGreeting?: boolean;
  /** True when user has prior conversation history — use short welcome-back greeting. */
  isReturningUser?: boolean;
  /** Response language (e.g. "Hindi", "Hinglish"). Set from deterministic detection on user message. */
  preferredLanguage?: string;
  /** User profile (city, userType, etc.) for personalization. */
  userProfile?: WebhookUserProfile;
};

export type WebhookUser = {
  phone: string;
  name?: string;
};

/**
 * Creates and populates a RequestContext for the webhook flow.
 * Call after intent is known; pass intent, optional preferredLanguage, and optional profile.
 */
export function createWebhookRequestContext(
  user: WebhookUser,
  intent?: string,
  preferredLanguage?: string,
  userProfile?: WebhookUserProfile | null,
  isReturningUser?: boolean
): RequestContext<WebhookRequestContext> {
  const ctx = new RequestContext<WebhookRequestContext>();
  ctx.set("userName", user.name ?? "");
  ctx.set("userPhone", user.phone ?? "");
  ctx.set("intent", intent ?? Intent.UNKNOWN);
  ctx.set("isGreeting", intent === Intent.GREETING && isReturningUser === false);
  ctx.set("isReturningUser", isReturningUser === true);
  if (preferredLanguage != null && preferredLanguage !== "") {
    ctx.set("preferredLanguage", preferredLanguage);
  }
  if (userProfile != null && Object.keys(userProfile).length > 0) {
    ctx.set("userProfile", userProfile);
  }
  return ctx;
}
