import { canonicalizeRole } from "@/features/shared/lib/rbac";

export type ProFixOperationsExperience = "operations" | "management";

export type ProFixOperationsIdentity = {
  name: "ProFix Operations";
  experience: ProFixOperationsExperience;
  eyebrow: "Operations workspace" | "Management view";
  headline: string;
  description: string;
};

const MANAGEMENT_ROLES = new Set(["owner", "admin", "manager"]);

export function resolveProFixOperationsExperience(
  role: string | null | undefined,
): ProFixOperationsExperience {
  return MANAGEMENT_ROLES.has(canonicalizeRole(role))
    ? "management"
    : "operations";
}

export function parseProFixOperationsExperience(
  value: string | null | undefined,
): ProFixOperationsExperience {
  return value === "management" ? "management" : "operations";
}

export function getProFixOperationsIdentity(
  experience: ProFixOperationsExperience,
): ProFixOperationsIdentity {
  if (experience === "management") {
    return {
      name: "ProFix Operations",
      experience,
      eyebrow: "Management view",
      headline: "See what needs management attention",
      description:
        "Review blockers, capacity, approvals, and shop performance using the data available to your role.",
    };
  }

  return {
    name: "ProFix Operations",
    experience,
    eyebrow: "Operations workspace",
    headline: "Keep today’s work moving",
    description:
      "Coordinate work orders, parts, approvals, scheduling, and shop blockers using the data available to your role.",
  };
}

export function withProFixOperationsExperience(
  href: string,
  experience: ProFixOperationsExperience,
): string {
  const [path, query = ""] = href.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("experience", experience);
  return `${path}?${params.toString()}`;
}
