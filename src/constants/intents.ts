/**
 * Intent string constants for routing. Single source of truth for branch logic.
 * Schema and enum live in intent-classifier.agent; these are for controller/routing.
 */
export const Intent = {
  GREETING: "greeting",
  CATALOG_QUERY: "catalog_query",
  PRODUCT_QUERY: "product_query",
  VIEW_ISSUES: "view_issues",
  CREATE_ISSUE_TICKET: "create_issue_ticket",
  UNKNOWN: "unknown",
} as const;

export type IntentValue = (typeof Intent)[keyof typeof Intent];
