"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export type Role = "owner" | "admin" | "manager" | "advisor" | "tech" | "customer" | "guest";

/**
 * Decide which UI mode to show for a work order:
 * - Query param wins: ?mode=tech or ?mode=view
 * - Otherwise default by role: tech -> "tech", everyone else -> "view"
 */
export function useWorkOrderMode(role: Role | null): "tech" | "view" {
  const sp = useSearchParams();
  return useMemo(() => {
    const qp = (sp.get("mode") || "").toLowerCase();
    if (qp === "tech" || qp === "view") return qp as "tech" | "view";
    return role === "tech" ? "tech" : "view";
  }, [role, sp]);
}
