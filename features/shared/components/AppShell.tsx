"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import RoleSidebar from "@/features/shared/components/RoleSidebar";
import ThemeToggleButton from "@/features/shared/components/ThemeToggleButton";

function buildBreadcrumb(pathname: string): { href: string; label: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [
    { href: "/dashboard", label: "Dashboard" },
  ];
  let current = "";
  parts.forEach((seg) => {
    current += `/${seg}`;
    crumbs.push({
      href: current,
      label: seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    });
  });
  return crumbs;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumb(pathname);

  const NavItem = ({ href, label }: { href: string; label: string }) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={[
          "flex-1 text-center py-2 text-xs font-medium transition-colors",
          active
            ? "text-accent font-semibold"
            : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ---------- Desktop Sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-white/5 bg-surface/80 backdrop-blur">
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white hover:text-accent transition"
          >
            ProFixIQ
          </Link>
          <ThemeToggleButton />
        </div>

        <RoleSidebar />
        <div className="mt-auto h-12 border-t border-white/5" />
      </aside>

      {/* ---------- Main Content ---------- */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Desktop Topbar */}
        <header className="hidden md:flex items-center justify-between h-14 px-6 border-b border-white/5 bg-background/60 backdrop-blur z-40">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1">
                {i > 0 && <span className="opacity-40">/</span>}
                <Link
                  href={c.href}
                  className={
                    i === crumbs.length - 1
                      ? "text-foreground font-medium"
                      : "hover:text-foreground"
                  }
                >
                  {c.label}
                </Link>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggleButton />
          </div>
        </header>

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between h-14 px-4 border-b border-white/10 bg-background/95 backdrop-blur z-40">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            ProFixIQ
          </Link>
          <ThemeToggleButton />
        </header>

        {/* ---------- Page Content ---------- */}
        <main className="flex-1 px-3 md:px-6 pt-14 md:pt-6 pb-14 md:pb-6 max-w-6xl w-full mx-auto">
          {children}
        </main>

        {/* ---------- Mobile Bottom Nav ---------- */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
          <div className="flex px-1">
            <NavItem href="/dashboard" label="Dashboard" />
            <NavItem href="/work-orders" label="Work Orders" />
            <NavItem href="/inspections" label="Inspections" />
            <NavItem href="/ai/assistant" label="Assistant" />
          </div>
        </nav>
      </div>
    </div>
  );
}