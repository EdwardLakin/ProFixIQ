"use client";

import Image from "next/image";

type Props = {
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  rightSlot?: React.ReactNode;
};

export default function BrandSurfaceHeader({
  title,
  subtitle,
  logoUrl,
  primaryColor,
  secondaryColor,
  accentColor,
  rightSlot,
}: Props) {
  const primary = primaryColor || "var(--brand-primary, #C97A3D)";
  const secondary = secondaryColor || "var(--brand-secondary, var(--theme-surface-page))";
  const accent = accentColor || "var(--brand-accent, #E2A164)";

  return (
    <div
      className="overflow-hidden rounded-3xl border border-[color:var(--theme-border-soft)] shadow-[var(--theme-shadow-medium)]"
      style={{
        background: `radial-gradient(circle at top, ${accent}22, transparent 45%), linear-gradient(135deg, ${secondary}, var(--theme-surface-inset))`,
      }}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-2">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Shop logo"
                width={64}
                height={64}
                className="max-h-12 w-auto object-contain"
                unoptimized
              />
            ) : (
              <div
                className="text-center text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: primary }}
              >
                Brand
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div
              className="text-[11px] uppercase tracking-[0.24em]"
              style={{ color: primary }}
            >
              ProFixIQ
            </div>
            <h1 className="mt-1 truncate text-2xl font-semibold text-[color:var(--theme-text-primary)] sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">{subtitle}</p>
            ) : null}
          </div>
        </div>

        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
