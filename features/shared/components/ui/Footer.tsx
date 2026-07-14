"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@shared/lib/utils";

const groups = [
  {
    title: "Product",
    links: [
      { label: "Workflow", href: "/#workflow" },
      { label: "Platform", href: "/#product" },
      { label: "Shop Boost", href: "/#shop-boost" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    title: "Access",
    links: [
      { label: "Shop sign-in", href: "/sign-in" },
      { label: "Customer portal", href: "/portal" },
      { label: "Fleet portal", href: "/portal/fleet" },
      { label: "Compare plans", href: "/compare-plans" },
    ],
  },
];

export default function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-[color:var(--marketing-border)] bg-[color:var(--marketing-ink)] text-white", className)}>
      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.35fr_0.65fr_0.65fr]">
          <div className="max-w-xl">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[10px] font-blackops tracking-[0.12em] text-[color:var(--marketing-ink)]">PFQ</span>
              <span className="text-lg font-bold">ProFixIQ</span>
            </Link>
            <h2 className="mt-8 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">See how ProFixIQ fits your shop.</h2>
            <p className="mt-4 max-w-lg text-base leading-7 text-slate-400">Bring inspections, repair building, approvals, parts, workforce operations, invoicing, and portals into one connected system.</p>
            <Link href="/compare-plans" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[color:var(--marketing-copper)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[color:var(--marketing-copper-dark)]">Start 14-day free trial <ArrowRight size={15} /></Link>
          </div>

          {groups.map((group) => (
            <div key={group.title}>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{group.title}</div>
              <ul className="mt-5 space-y-3">
                {group.links.map((link) => <li key={link.href}><Link href={link.href} className="text-sm text-slate-300 transition hover:text-white">{link.label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ProFixIQ Technologies. All rights reserved.</span>
          <span>Heavy-Duty • Automotive • Fleet</span>
        </div>
      </div>
    </footer>
  );
}
