export type WorkforceNavigationRole = "owner" | "admin" | "manager";

export type WorkforceNavigationItem = {
  href: string;
  label: string;
  description: string;
  icon:
    | "command"
    | "people"
    | "attendance"
    | "schedule"
    | "payroll"
    | "documents"
    | "certifications"
    | "insights"
    | "activity";
  roles: readonly WorkforceNavigationRole[];
  matchPrefixes?: readonly string[];
};

const ALL_WORKFORCE_MANAGERS = ["owner", "admin", "manager"] as const;
const OWNER_ADMIN = ["owner", "admin"] as const;

export const WORKFORCE_NAVIGATION: readonly WorkforceNavigationItem[] = [
  {
    href: "/dashboard/workforce/overview",
    label: "Command",
    description: "Coverage and exceptions",
    icon: "command",
    roles: ALL_WORKFORCE_MANAGERS,
  },
  {
    href: "/dashboard/workforce/people",
    label: "People",
    description: "Team and access",
    icon: "people",
    roles: OWNER_ADMIN,
    matchPrefixes: ["/dashboard/workforce/people/"],
  },
  {
    href: "/dashboard/workforce/attendance",
    label: "Attendance",
    description: "Shifts and job time",
    icon: "attendance",
    roles: ALL_WORKFORCE_MANAGERS,
  },
  {
    href: "/dashboard/workforce/scheduling",
    label: "Schedule",
    description: "Coverage and time away",
    icon: "schedule",
    roles: ALL_WORKFORCE_MANAGERS,
    matchPrefixes: ["/dashboard/workforce/time-off"],
  },
  {
    href: "/dashboard/workforce/payroll-review",
    label: "Payroll",
    description: "Review and export",
    icon: "payroll",
    roles: ALL_WORKFORCE_MANAGERS,
  },
  {
    href: "/dashboard/workforce/documents",
    label: "Documents",
    description: "Records and requirements",
    icon: "documents",
    roles: OWNER_ADMIN,
  },
  {
    href: "/dashboard/workforce/certifications",
    label: "Certifications",
    description: "Expiry readiness",
    icon: "certifications",
    roles: OWNER_ADMIN,
  },
  {
    href: "/dashboard/workforce/insights",
    label: "Insights",
    description: "Trends and capacity",
    icon: "insights",
    roles: ALL_WORKFORCE_MANAGERS,
  },
  {
    href: "/dashboard/workforce/activity",
    label: "Activity",
    description: "Correction and access trail",
    icon: "activity",
    roles: OWNER_ADMIN,
  },
] as const;

export function getWorkforceNavigation(
  role: string,
): readonly WorkforceNavigationItem[] {
  return WORKFORCE_NAVIGATION.filter((item) =>
    item.roles.includes(role as WorkforceNavigationRole),
  );
}

export function isWorkforceNavigationItemActive(
  pathname: string,
  item: WorkforceNavigationItem,
): boolean {
  if (pathname === item.href) return true;
  return (
    item.matchPrefixes?.some((prefix) => pathname.startsWith(prefix)) ?? false
  );
}
