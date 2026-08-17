import Link from "next/link";
import {
  ArrowRight,
  Check,
  CircleGauge,
  MapPinned,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import {
  ProFixIQMark,
  ProFixIQWordmark,
} from "@shared/components/brand/ProFixIQBrand";
import Footer from "@shared/components/ui/Footer";

export type ProductMarketingConfig = {
  eyebrow: string;
  title: string;
  lead: string;
  price: string;
  priceDetail: string;
  accent: "field" | "fleet";
  signInHref: string;
  signInLabel: string;
  features: Array<{ title: string; body: string; icon: LucideIcon }>;
  outcomes: string[];
  accessSteps: Array<{ number: string; title: string; body: string }>;
  preview: {
    label: string;
    title: string;
    status: string;
    stats: Array<{ label: string; value: string }>;
    rows: Array<{ title: string; detail: string; state: string }>;
  };
};

export default function ProductMarketingPage({
  config,
}: {
  config: ProductMarketingConfig;
}) {
  const field = config.accent === "field";
  const accent = field ? "#38bdf8" : "#34d399";
  const accentStrong = field ? "#0284c7" : "#059669";

  return (
    <div
      className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]"
      style={
        {
          "--product-accent": accent,
          "--product-accent-strong": accentStrong,
        } as React.CSSProperties
      }
    >
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#07111f]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-3"
            aria-label="ProFixIQ home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5">
              <ProFixIQMark className="h-7 w-7" />
            </span>
            <span>
              <ProFixIQWordmark className="block text-lg text-white" />
              <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                {config.eyebrow}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href={config.signInHref}
              className="hidden px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white sm:inline-flex"
            >
              {config.signInLabel}
            </Link>
            <Link
              href="/compare-plans"
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#07111f] shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5"
              style={{ backgroundColor: accent }}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#07111f] text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background: `radial-gradient(circle at 74% 24%, ${accent}55, transparent 34%), radial-gradient(circle at 12% 84%, ${accentStrong}33, transparent 30%)`,
            }}
          />
          <div className="relative mx-auto grid max-w-[1400px] gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.88fr_1.12fr] lg:items-center">
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.2em]"
                style={{
                  borderColor: `${accent}55`,
                  backgroundColor: `${accent}12`,
                  color: accent,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: accent }}
                />
                {config.eyebrow}
              </div>
              <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[4.8rem]">
                {config.title}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
                {config.lead}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/compare-plans"
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-[#07111f] shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5"
                  style={{ backgroundColor: accent }}
                >
                  Start 7-day free trial <ArrowRight size={16} />
                </Link>
                <Link
                  href={config.signInHref}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  {config.signInLabel}
                </Link>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-400">
                {config.outcomes.map((outcome) => (
                  <span key={outcome} className="flex items-center gap-2">
                    <Check size={15} style={{ color: accent }} /> {outcome}
                  </span>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0d1929]/90 shadow-[0_38px_100px_rgba(0,0,0,0.45)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {config.preview.label}
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {config.preview.title}
                  </div>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{ backgroundColor: `${accent}1f`, color: accent }}
                >
                  {config.preview.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-px bg-white/10">
                {config.preview.stats.map((stat) => (
                  <div key={stat.label} className="bg-[#0d1929] p-5">
                    <div className="text-2xl font-semibold tracking-[-0.04em]">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-slate-500">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3 p-5">
                {config.preview.rows.map((row, index) => (
                  <div
                    key={row.title}
                    className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-[#07111f]"
                      style={{
                        backgroundColor: index === 0 ? accent : `${accent}bb`,
                      }}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">
                        {row.title}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {row.detail}
                      </div>
                    </div>
                    <span
                      className="text-xs font-bold"
                      style={{ color: accent }}
                    >
                      {row.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {config.features.map(({ title, body, icon: Icon }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] p-6"
                >
                  <span
                    className="grid h-11 w-11 place-items-center rounded-xl bg-white shadow-sm"
                    style={{ color: accentStrong }}
                  >
                    <Icon size={20} />
                  </span>
                  <h2 className="mt-8 text-xl font-bold tracking-[-0.025em]">
                    {title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto grid max-w-[1400px] gap-14 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <div className="marketing-eyebrow">Access by design</div>
              <h2 className="marketing-heading mt-4">
                The right workspace for the right operator.
              </h2>
              <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">
                Product entitlement opens the workspace. Organization settings
                and explicit role assignment decide who can act inside it.
              </p>
            </div>
            <div className="space-y-4">
              {config.accessSteps.map((step) => (
                <article
                  key={step.number}
                  className="grid gap-4 rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-sm sm:grid-cols-[72px_1fr]"
                >
                  <span
                    className="text-3xl font-semibold tracking-[-0.05em]"
                    style={{ color: accentStrong }}
                  >
                    {step.number}
                  </span>
                  <div>
                    <h3 className="text-xl font-bold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--marketing-muted)]">
                      {step.body}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#07111f] py-20 text-white sm:py-24">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-5 sm:px-8 md:flex-row md:items-end md:justify-between">
            <div>
              <div
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]"
                style={{ color: accent }}
              >
                <CircleGauge size={16} /> Straightforward capacity
              </div>
              <div className="mt-5 flex items-end gap-3">
                <span className="text-6xl font-semibold tracking-[-0.06em]">
                  {config.price}
                </span>
                <span className="pb-2 text-sm text-slate-400">/ month</span>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">
                {config.priceDetail}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={config.signInHref}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3.5 text-sm font-bold"
              >
                <ShieldCheck size={16} /> {config.signInLabel}
              </Link>
              <Link
                href="/compare-plans"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-[#07111f]"
                style={{ backgroundColor: accent }}
              >
                Start free trial <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

export const PRODUCT_MARKETING_ICONS = {
  operations: CircleGauge,
  location: MapPinned,
  security: ShieldCheck,
};
