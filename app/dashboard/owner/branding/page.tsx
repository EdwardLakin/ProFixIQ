"use client";

import BrandStudioCard from "@/features/branding/components/BrandStudioCard";

export default function OwnerBrandingPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 p-5 text-foreground lg:p-6">
      <section className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-neutral-400">
              Owner workspace
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-50">
              Brand Studio
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Manage your shop identity, generated logos, colors, and branded previews.
            </p>
          </div>
        </div>
      </section>

      <BrandStudioCard />
    </div>
  );
}