// features/fleet/components/FleetTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/fleet/tower", label: "Fleet Tower" },
  { href: "/fleet/units", label: "Fleet Units" },
  { href: "/fleet/pretrip", label: "Pre-trip Reports" },
  { href: "/fleet/service-requests", label: "Service Requests" },
  { href: "/fleet/dispatch", label: "Dispatch" },
];

export default function FleetTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href;

        const base =
          "rounded-full border px-3 py-1.5 transition-colors " +
          "border-[color:var(--metal-border-soft)] bg-black/40 text-neutral-300 hover:bg-neutral-900/60";

        const active =
          "border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)]/15 " +
          "text-[color:var(--accent-copper)] shadow-[0_0_14px_rgba(248,113,22,0.55)]";

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={base + (isActive ? " " + active : "")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}