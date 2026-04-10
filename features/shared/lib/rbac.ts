export type CanonicalRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "service"
  | "parts"
  | "mechanic"
  | "lead_hand"
  | "fleet_manager"
  | "dispatcher"
  | "driver"
  | "customer"
  | "unknown";

const ROLE_ALIASES: Record<string, CanonicalRole> = {
  owner: "owner",
  admin: "admin",
  manager: "manager",
  advisor: "advisor",
  service: "service",
  parts: "parts",
  mechanic: "mechanic",
  tech: "mechanic",
  technician: "mechanic",
  lead_hand: "lead_hand",
  leadhand: "lead_hand",
  lead: "lead_hand",
  fleet_manager: "fleet_manager",
  dispatcher: "dispatcher",
  driver: "driver",
  customer: "customer",
};

export function canonicalizeRole(role: string | null | undefined): CanonicalRole {
  const key = String(role ?? "").trim().toLowerCase();
  return ROLE_ALIASES[key] ?? "unknown";
}

export function hasAnyRole(
  role: string | null | undefined,
  allowed: readonly CanonicalRole[],
): boolean {
  return allowed.includes(canonicalizeRole(role));
}

export function isAdminRole(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["owner", "admin", "manager"]);
}

export function canMutateWorkOrders(role: string | null | undefined): boolean {
  return hasAnyRole(role, [
    "owner",
    "admin",
    "manager",
    "advisor",
    "service",
    "mechanic",
    "lead_hand",
  ]);
}

export function canSendQuotes(role: string | null | undefined): boolean {
  return hasAnyRole(role, ["owner", "admin", "manager", "advisor", "service"]);
}
