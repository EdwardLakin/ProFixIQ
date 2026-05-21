import Link from "next/link";

type WorkforceQuickLinksProps = {
  roleScope: "owner_admin" | "manager";
  className?: string;
};

type WorkforceLink = { href: string; label: string };

const ownerAdminLinks: WorkforceLink[] = [
  { href: "/dashboard/workforce/overview", label: "Overview" },
  { href: "/dashboard/workforce/scheduling", label: "Scheduling" },
  { href: "/dashboard/workforce/time-off", label: "Time Off" },
  { href: "/dashboard/workforce/attendance", label: "Attendance" },
  { href: "/dashboard/workforce/payroll-review", label: "Payroll Review" },
  { href: "/dashboard/workforce/documents", label: "Documents" },
  { href: "/dashboard/workforce/certifications", label: "Certifications" },
  { href: "/dashboard/workforce/insights", label: "Insights" },
];

const managerLinks: WorkforceLink[] = ownerAdminLinks.filter((link) =>
  [
    "/dashboard/workforce/overview",
    "/dashboard/workforce/scheduling",
    "/dashboard/workforce/time-off",
    "/dashboard/workforce/attendance",
    "/dashboard/workforce/payroll-review",
    "/dashboard/workforce/insights",
  ].includes(link.href),
);

export function WorkforceQuickLinks({ roleScope, className }: WorkforceQuickLinksProps) {
  const links = roleScope === "owner_admin" ? ownerAdminLinks : managerLinks;

  return (
    <nav className={className ?? "mt-4 flex flex-wrap gap-2"} aria-label="Workforce quick links">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-md border border-orange-300/30 bg-orange-500/10 px-3 py-1.5 text-sm text-orange-100 transition hover:border-orange-300/60 hover:bg-orange-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
