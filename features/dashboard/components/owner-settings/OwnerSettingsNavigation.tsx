"use client";

import { useMemo, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CreditCard,
  Gauge,
  Mail,
  PlugZap,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { cn } from "@/features/shared/lib/utils";

export type OwnerSettingsSectionId =
  | "overview"
  | "business"
  | "operations"
  | "automation"
  | "team"
  | "scheduling"
  | "communications"
  | "integrations"
  | "organization"
  | "billing";

export const OWNER_SETTINGS_SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    description: "Account and system health",
    keywords: "summary identity seats status",
    icon: Gauge,
  },
  {
    id: "business",
    label: "Business profile",
    description: "Identity, location, and brand",
    keywords: "shop address logo public profile",
    icon: BriefcaseBusiness,
  },
  {
    id: "operations",
    label: "Operations",
    description: "Pricing, tax, workflow, portal",
    keywords: "labor rate supplies authorization appearance customer portal",
    icon: SlidersHorizontal,
  },
  {
    id: "automation",
    label: "AI automation",
    description: "Readiness and execution policy",
    keywords: "assistant learning automatic actions",
    icon: Bot,
  },
  {
    id: "team",
    label: "Team access",
    description: "Create users and manage accounts",
    keywords: "create user staff employee people users password invite role profiles workforce",
    icon: UsersRound,
  },
  {
    id: "scheduling",
    label: "Scheduling & payroll",
    description: "Hours, closures, and timekeeping",
    keywords: "hours time off breaks lunch overtime cadence",
    icon: CalendarDays,
  },
  {
    id: "communications",
    label: "Communication",
    description: "Invoices and delivery activity",
    keywords: "email invoice terms footer completion",
    icon: Mail,
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "QuickBooks and connected tools",
    keywords: "accounting quickbooks brand studio",
    icon: PlugZap,
  },
  {
    id: "organization",
    label: "Organization",
    description: "Locations and shop scope",
    keywords: "multi location switch organization",
    icon: Building2,
  },
  {
    id: "billing",
    label: "Billing & plan",
    description: "Subscription, payouts, and seats",
    keywords: "stripe plan seats subscription payout invoices",
    icon: CreditCard,
  },
] as const satisfies ReadonlyArray<{
  id: OwnerSettingsSectionId;
  label: string;
  description: string;
  keywords: string;
  icon: typeof Gauge;
}>;

export function ownerSettingsSectionLabel(id: OwnerSettingsSectionId): string {
  return (
    OWNER_SETTINGS_SECTIONS.find((section) => section.id === id)?.label ??
    "Settings"
  );
}

export default function OwnerSettingsNavigation({
  activeSection,
  onSectionChange,
}: {
  activeSection: OwnerSettingsSectionId;
  onSectionChange: (section: OwnerSettingsSectionId) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredSections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return OWNER_SETTINGS_SECTIONS;
    return OWNER_SETTINGS_SECTIONS.filter((section) =>
      `${section.label} ${section.description} ${section.keywords}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  return (
    <>
      <div className="xl:hidden">
        <label
          htmlFor="owner-settings-category"
          className="mb-1.5 block text-xs font-semibold text-[color:var(--theme-text-secondary)]"
        >
          Settings category
        </label>
        <select
          id="owner-settings-category"
          value={activeSection}
          onChange={(event) =>
            onSectionChange(event.target.value as OwnerSettingsSectionId)
          }
          className="h-11 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] px-3 text-sm font-semibold text-[color:var(--theme-input-text)] outline-none focus:border-[var(--accent-copper)]"
        >
          {OWNER_SETTINGS_SECTIONS.map((section) => (
            <option key={section.id} value={section.id}>
              {section.label}
            </option>
          ))}
        </select>
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-20 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3 shadow-[var(--theme-shadow-soft)]">
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--theme-text-muted)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a setting"
              aria-label="Find a setting"
              className="h-10 w-full rounded-xl border border-[color:var(--theme-input-border)] bg-[color:var(--theme-input-bg)] pl-9 pr-3 text-xs text-[color:var(--theme-input-text)] outline-none focus:border-[var(--accent-copper)]"
            />
          </div>

          <nav aria-label="Owner settings categories" className="space-y-1">
            {filteredSections.map((section) => {
              const Icon = section.icon;
              const active = section.id === activeSection;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSectionChange(section.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
                    active
                      ? "border-[color:color-mix(in_srgb,var(--accent-copper)_45%,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--accent-copper)_12%,var(--theme-surface-subtle))]"
                      : "border-transparent hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                      active
                        ? "bg-[var(--accent-copper)] text-[color:var(--theme-text-on-accent)]"
                        : "bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      {section.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[color:var(--theme-text-muted)]">
                      {section.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          {filteredSections.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[color:var(--theme-text-muted)]">
              No matching settings.
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
