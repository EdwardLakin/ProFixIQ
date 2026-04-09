"use client";

import Image from "next/image";
import Link from "next/link";
import { useActiveBrand } from "@/features/branding/hooks/useActiveBrand";
import { Button } from "@shared/components/ui/Button";

function Swatch({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <span
          className="h-8 w-8 rounded-md border border-white/10"
          style={{ backgroundColor: value }}
        />
        <span className="text-sm text-neutral-200">{value}</span>
      </div>
    </div>
  );
}

export default function BrandStudioSummaryCard() {
  const { data, loading } = useActiveBrand();

  const logoUrl = data?.logoUrl ?? null;
  const profile = data?.profile ?? null;

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/25 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
            Brand identity
          </div>
          <h2 className="mt-1 text-sm font-semibold text-neutral-50">
            Brand Studio
          </h2>
          <p className="mt-1 text-[12px] text-neutral-400">
            Manage active logo, colors, style preset, and generated assets.
          </p>
        </div>

        <Link href="/dashboard/owner/branding">
          <Button type="button">Open Brand Studio</Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-400">Loading brand…</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                Active logo
              </div>

              <div className="mt-3 flex h-28 items-center justify-center rounded-lg border border-white/10 bg-black/30">
                {logoUrl ? (
                  <Image
                    src={logoUrl}
                    alt="Active logo"
                    width={160}
                    height={80}
                    className="max-h-20 max-w-full object-contain"
                    unoptimized
                  />
                ) : (
                  <span className="text-sm text-neutral-500">
                    No active logo
                  </span>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Swatch
                label="Primary"
                value={profile?.primary_color ?? "#C1663B"}
              />
              <Swatch
                label="Secondary"
                value={profile?.secondary_color ?? "#050910"}
              />
              <Swatch
                label="Accent"
                value={profile?.accent_color ?? "#E39A6E"}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-neutral-300">
            Active style:{" "}
            <span className="font-medium text-neutral-100">
              {profile?.style_preset ?? "clean-oem"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
