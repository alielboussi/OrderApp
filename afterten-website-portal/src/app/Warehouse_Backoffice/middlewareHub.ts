export type MiddlewareHubView = "main" | "failures";

export const MIDDLEWARE_HUB_PATH = "/Warehouse_Backoffice/middleware";

export const MIDDLEWARE_MAIN_DESCRIPTION =
  "Monitor outlet middleware heartbeats, pending sales, and push catalog updates to MintPOS tills.";

export const MIDDLEWARE_FAILURES_DESCRIPTION =
  "Investigate failed POS sync events and retry needs.";

export function middlewareTabHref(view: MiddlewareHubView): string {
  return view === "failures" ? `${MIDDLEWARE_HUB_PATH}#failures` : MIDDLEWARE_HUB_PATH;
}

export function middlewareTabTitle(tabId: string): string | null {
  if (parseMiddlewareView(tabId) === "failures") return "POS Sync Failures";
  return null;
}

export function parseMiddlewareView(hash: string): MiddlewareHubView {
  const normalized = hash.replace(/^#/, "");
  if (normalized === "failures") return "failures";
  return "main";
}

/** @deprecated Use parseMiddlewareView */
export function parseMiddlewareTabId(hash: string): MiddlewareHubView {
  return parseMiddlewareView(hash);
}
