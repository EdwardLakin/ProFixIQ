"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileClock,
  Files,
  Gauge,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  getWorkforceNavigation,
  isWorkforceNavigationItemActive,
  type WorkforceNavigationItem,
} from "./workforceNavigation";

const ICONS: Record<WorkforceNavigationItem["icon"], LucideIcon> = {
  command: Gauge,
  people: UsersRound,
  attendance: Clock3,
  schedule: CalendarDays,
  payroll: FileClock,
  documents: Files,
  certifications: ShieldCheck,
  insights: BarChart3,
  activity: ClipboardCheck,
};

export default function WorkforceShell({
  role,
  children,
}: {
  role: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navigation = getWorkforceNavigation(role);
  const activeItem =
    navigation.find((item) =>
      isWorkforceNavigationItemActive(pathname, item),
    ) ?? navigation[0];

  return (
    <section className="min-h-[calc(100vh-3rem)] bg-[var(--theme-gradient-page)] text-[color:var(--theme-text-primary)]">
      <div className="mx-auto w-full max-w-[1800px] px-3 pb-8 pt-4 sm:px-5 lg:px-6">
        <header className="overflow-hidden rounded-[1.35rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] shadow-[var(--theme-shadow-medium)]">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between lg:px-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-accent-text)]">
                  <Gauge className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div>
                  <p className="text-[0.67rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--theme-text-secondary)]">
                    Shop workforce
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    Workforce Command
                  </h1>
                </div>
              </div>
              <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
                People, coverage, time, payroll readiness, and compliance in one
                connected workspace.
              </p>
            </div>

            {activeItem ? (
              <div className="hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-right lg:block">
                <p className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                  {activeItem.label}
                </p>
                <p className="text-[0.7rem] text-[color:var(--theme-text-secondary)]">
                  {activeItem.description}
                </p>
              </div>
            ) : null}
          </div>

          <nav
            aria-label="Workforce sections"
            className="border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"
          >
            <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 sm:px-4">
              {navigation.map((item) => {
                const active = isWorkforceNavigationItemActive(pathname, item);
                const Icon = ICONS[item.icon];

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className="group flex min-w-max items-center gap-2 rounded-xl border px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
                    style={{
                      borderColor: active
                        ? "color-mix(in srgb, var(--brand-primary) 64%, var(--theme-border-strong))"
                        : "var(--theme-border-soft)",
                      background: active
                        ? "color-mix(in srgb, var(--brand-primary) 16%, var(--theme-surface-panel))"
                        : "var(--theme-surface-panel)",
                      color: active
                        ? "var(--theme-accent-text)"
                        : "var(--theme-text-secondary)",
                      boxShadow: active
                        ? "inset 0 -2px 0 color-mix(in srgb, var(--brand-primary) 82%, transparent)"
                        : "none",
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold leading-none">
                        {item.label}
                      </span>
                      <span className="mt-1 hidden text-[0.67rem] leading-none text-[color:var(--theme-text-muted)] xl:block">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </header>

        <main className="mt-4">{children}</main>
      </div>
    </section>
  );
}
