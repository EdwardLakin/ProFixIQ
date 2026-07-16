import Link from "next/link";
import type { ReactNode } from "react";

const links = [
  ["Terms", "/legal/terms"],
  ["Privacy", "/legal/privacy"],
  ["DPA", "/legal/data-processing-addendum"],
  ["Portal terms", "/legal/portal-terms"],
  ["Repair authorization", "/legal/repair-authorization"],
  ["Subprocessors", "/legal/subprocessors"],
] as const;

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)]">
      <div className="pointer-events-none fixed inset-0 bg-[var(--theme-gradient-page)]" />
      <header className="relative z-10 border-b border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-surface-overlay)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <Link
            href="/"
            className="text-xl tracking-[0.08em] sm:text-2xl"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            PRO<span className="text-[var(--accent-copper)]">FIX</span>IQ
          </Link>
          <nav
            aria-label="Legal navigation"
            className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[color:var(--theme-text-secondary)]"
          >
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="hover:text-[var(--accent-copper)]"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="relative z-10 px-4 py-8 sm:px-7 sm:py-12">
        {children}
      </main>
    </div>
  );
}
