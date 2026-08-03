export const INCLUDED_USERS = 10;
export const BASE_MONTHLY_PRICE = 299;
export const ADDITIONAL_USER_MONTHLY_PRICE = 50;
export const UNLIMITED_MONTHLY_PRICE = 600;
export const UNLIMITED_USER_THRESHOLD = 17;

export const BASE_PRICE_LOOKUP_KEY = "profixiq_base_monthly_v2";
export const ADDITIONAL_SEAT_LOOKUP_KEY = "profixiq_additional_seat_monthly_v2";
export const UNLIMITED_PRICE_LOOKUP_KEY = "profixiq_unlimited_monthly_v2";

export const DEFAULT_STRIPE_PLATFORM_FEE_BPS = 0;
export const MAX_STRIPE_PLATFORM_FEE_BPS = 1_000;

export function getAdditionalSeatQuantity(activeUsers: number): number {
  const normalizedUsers = Number.isFinite(activeUsers)
    ? Math.max(0, Math.trunc(activeUsers))
    : 0;
  return Math.max(0, normalizedUsers - INCLUDED_USERS);
}

export function shouldUseUnlimitedPrice(activeUsers: number): boolean {
  const normalizedUsers = Number.isFinite(activeUsers)
    ? Math.max(0, Math.trunc(activeUsers))
    : 0;
  return normalizedUsers >= UNLIMITED_USER_THRESHOLD;
}

export function calculateMonthlySubscriptionPrice(activeUsers: number): number {
  if (shouldUseUnlimitedPrice(activeUsers)) return UNLIMITED_MONTHLY_PRICE;
  return BASE_MONTHLY_PRICE + getAdditionalSeatQuantity(activeUsers) * ADDITIONAL_USER_MONTHLY_PRICE;
}
