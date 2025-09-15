"use client";

import { usePathname } from "next/navigation";

/**
 * Generate a unique storage key per route/tab for persistence.
 * Example: "/work-orders/123" + "assistant" → "tabs:_work_orders_123:assistant"
 */
export function useTabsScopedStorageKey(subkey: string) {
  const pathname = usePathname();
  const safePath = pathname.replace(/\W+/g, "_"); // sanitize route
  return `tabs:${safePath}:${subkey}`;
}