"use client";

import Link from "next/link";

type Role = "owner" | "manager" | "advisor" | "tech" | "admin" | "parts";

type Props = {
  /** The current user role */
  role?: Role;
  /** Extra classes to position the grid */
  className?: string;
};

const OWNER_ROLE_LINKS: { label: string; href: string }[] = [
  { label: "Workforce Command", href: "/dashboard/workforce" },
  { label: "Advisor Dashboard", href: "/dashboard/advisor" },
  { label: "Manager Dashboard", href: "/dashboard/manager" },
  { label: "Tech Dashboard",    href: "/dashboard/tech" },
  { label: "Parts Dashboard",   href: "/dashboard/parts" },
];

export default function QuickActions({ role, className = "" }: Props) {
  // Only show these “jump to other dashboards” buttons for owners
  if (role !== "owner") return null;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}>
      {OWNER_ROLE_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-4 py-3
                     text-left hover:border-orange-500 hover:-translate-y-0.5
                     transition will-change-transform"
          aria-label={item.label}
        >
          <div className="text-[color:var(--theme-text-primary)] font-semibold">{item.label}</div>
          <div className="text-xs text-[color:var(--theme-text-secondary)] mt-0.5">Open {item.label}</div>
        </Link>
      ))}
    </div>
  );
}
