import "server-only";

const DEMO_SHOP_ID_ENV = "DEMO_SHOP_ID";

/**
 * The configured Demo Shop id, read from trusted server config only.
 * Never accept a client-supplied shop id as the Demo Shop id.
 */
export function getDemoShopId(): string | null {
  const value = process.env[DEMO_SHOP_ID_ENV]?.trim();
  return value ? value : null;
}

export function isConfiguredDemoShop(shopId: string | null | undefined): boolean {
  const demoShopId = getDemoShopId();
  return Boolean(demoShopId && shopId && shopId === demoShopId);
}

/**
 * A malformed or unparseable timestamp fails closed (treated as expired)
 * rather than granting access on bad data.
 */
export function isDemoAccessExpired(
  demoAccessExpiresAt: string | null | undefined,
): boolean {
  if (!demoAccessExpiresAt) return false;

  const expiresAtMs = Date.parse(demoAccessExpiresAt);
  if (Number.isNaN(expiresAtMs)) return true;

  return expiresAtMs <= Date.now();
}
