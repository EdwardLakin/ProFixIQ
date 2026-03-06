export type DashboardRole =
  | "owner"
  | "admin"
  | "manager"
  | "advisor"
  | "mechanic"
  | "technician"
  | "tech"
  | "parts"
  | "customer"
  | "driver"
  | "dispatcher"
  | "fleet_manager"
  | null;

export function isTechRole(role: string | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "tech" || r === "technician" || r === "mechanic";
}

export function isAdvisorLikeRole(role: string | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "advisor" || r === "manager" || r === "admin" || r === "owner";
}

export function canViewOwnerWidgets(role: string | null): boolean {
  const r = String(role ?? "").toLowerCase();
  return r === "owner" || r === "admin" || r === "manager";
}
