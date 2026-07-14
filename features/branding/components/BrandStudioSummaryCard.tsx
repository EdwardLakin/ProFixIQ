"use client";

import Image from "next/image";
import Link from "next/link";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import { Button } from "@shared/components/ui/Button";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";

function Swatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">{label}</div>
      <div className="mt-2 flex items-center gap-3">
        <span className="h-8 w-8 rounded-md border border-[color:var(--theme-border-soft)]" style={{ backgroundColor: value }} />
        <span className="text-sm text-[color:var(--theme-text-primary)]">{value}</span>
      </div>
    </div>
  );
}

export default function BrandStudioSummaryCard() {
  const { data, loading } = useActiveBrand();

  const logoUrl = data?.logoUrl ?? null;
  const profile = data?.profile ?? null;

  return (
    <section id="branding-system" className={`${PANEL_VARIANTS.primary} space-y-4 p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--theme-card-border,var(--theme-border-soft))]/70 pb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">Brand system</div>
          <h2 className="mt-1 text-sm font-semibold text-[color:var(--theme-text-primary)]">Brand Studio</h2>
          <p className="mt-1 text-[12px] text-[color:var(--theme-text-secondary)]">
            Configure active logo, theme palette, and style preset used across the app.
          </p>
        </div>

        <Link href="/dashboard/owner/branding">
          <Button type="button">Open Brand Studio</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading brand...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">Active logo</div>

              <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
                {logoUrl ? (
                  <Image src={logoUrl} alt="Active logo" width={160} height={80} className="max-h-20 max-w-full object-contain" unoptimized />
                ) : (
                  <span className="text-sm text-[color:var(--theme-text-muted)]">No active logo</span>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Swatch label="Primary" value={profile?.primary_color ?? "#C1663B"} />
              <Swatch label="Secondary" value={profile?.secondary_color ?? "var(--theme-surface-page)"} />
              <Swatch label="Accent" value={profile?.accent_color ?? "#E39A6E"} />
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-sm text-[color:var(--theme-text-secondary)]">
            Active style: <span className="font-medium text-[color:var(--theme-text-primary)]">{profile?.style_preset ?? "clean-oem"}</span>
          </div>
        </>
      )}
    </section>
  );
}
