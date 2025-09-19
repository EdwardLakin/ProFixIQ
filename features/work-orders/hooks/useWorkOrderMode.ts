"use client";
import { useSearchParams } from "next/navigation";

export type Role = "owner"|"admin"|"manager"|"advisor"|"tech"|"customer"|"guest";

/** Pure helper (usable in tests) */
export function pickMode(role: Role | null, sp: URLSearchParams): "tech"|"view" {
  const qp = (sp.get("mode") || "").toLowerCase();
  if (qp === "tech" || qp === "view") return qp as "tech"|"view";
  return (role === "tech") ? "tech" : "view";
}

/** Hook convenience for client components */
export function useWorkOrderMode(role: Role | null) {
  const sp = useSearchParams();
  return pickMode(role, sp);
}
