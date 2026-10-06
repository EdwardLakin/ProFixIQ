import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheckBig,
  Quote,
} from "lucide-react";

import {
  ProFixIQMark,
  ProFixIQWordmark,
} from "@shared/components/brand/ProFixIQBrand";
import Footer from "@shared/components/ui/Footer";

import type { SearchLandingFaq } from "../searchLanding";

export type SearchLandingLink = {
  label: string;
  href: string;
};

export type SearchLandingMedia = {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
};

export type SearchLandingConfig = {
  eyebrow: string;
  title: string;
  lead: string;
  primaryCta?: SearchLandingLink;
  secondaryCta?: SearchLandingLink;
  proofPoints?: string[];
  painPoints: {
    eyebrow?: string;
    heading: string;
    body?: string;
    items: Array<{ title: string; body: string }>;
  };
  workflow: {
    eyebrow?: string;
    heading: string;
    body?: string;
    steps: Array<{ title: string; body: string }>;
  };
  productProof: {
    eyebrow?: string;
    heading: string;
    body?: string;
    media?: SearchLandingMedia;
    items: Array<{ title: string; body: string }>;
  };
  comparison?: {
    eyebrow?: string;
    heading: string;
    body?: string;
    alternativeLabel: string;
    rows: Array<{
      capability: string;
      profixiq: string;
      alternative: string;
    }>;
    note?: string;
  };
  faqs: SearchLandingFaq[];
  finalCta: {
    eyebrow?: string;
    heading: string;
    body: string;
    primary?: SearchLandingLink;
    secondary?: SearchLandingLink;
  };
};

const defaultPrimaryCta: SearchLandingLink = {
  label: "Start 7-day free trial",
  href: "/compare-plans",
};

const defaultSecondaryCta: SearchLandingLink = {
  label: "Request demo access",
  href: "/request-demo",
};

function MarketingHeader() {
  return (
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
          <ProFixIQWordmark className="block text-lg text-white" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/request-demo"
            className="hidden px-3 py-2 text-sm font-semibold text-slate-300 transition hover:text-white sm:inline-flex"
          >
            Request demo
          </Link>
          <Link
            href="/compare-plans"
            className="rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-bold text-[#07111f] shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition hover:-translate-y-0.5"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SearchHero({
  config,
}: {
  config: Pick<
    SearchLandingConfig,
    | "eyebrow"
    | "title"
    | "lead"
    | "primaryCta"
    | "secondaryCta"
    | "proofPoints"
  >;
}) {
  const primary = config.primaryCta ?? defaultPrimaryCta;
  const secondary = config.secondaryCta ?? defaultSecondaryCta;

  return (
    <section className="relative overflow-hidden bg-[#07111f] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(56,189,248,0.2),transparent_32%),radial-gradient(circle_at_8%_78%,rgba(37,99,235,0.17),transparent_30%)]" />
      <div className="relative mx-auto max-w-[1180px] px-5 py-20 text-center sm:px-8 sm:py-28">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
          {config.eyebrow}
        </div>
        <h1 className="mx-auto mt-7 max-w-5xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[4.6rem]">
          {config.title}
        </h1>
        <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-slate-300 sm:text-xl">
          {config.lead}
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link
            href={primary.href}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-bold text-[#07111f] shadow-[0_16px_40px_rgba(0,0,0,0.3)] transition hover:-translate-y-0.5"
          >
            {primary.label} <ArrowRight size={16} />
          </Link>
          <Link
            href={secondary.href}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
          >
            {secondary.label}
          </Link>
        </div>
        {config.proofPoints?.length ? (
          <div className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-400">
            {config.proofPoints.map((point) => (
              <span key={point} className="flex items-center gap-2">
                <Check size={15} className="text-sky-300" /> {point}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SearchPainPoints({
  section,
}: {
  section: SearchLandingConfig["painPoints"];
}) {
  return (
    <section className="border-b border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="max-w-3xl">
          <div className="marketing-eyebrow">
            {section.eyebrow ?? "Why shops look for a better system"}
          </div>
          <h2 className="marketing-heading mt-4">{section.heading}</h2>
          {section.body ? (
            <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">
              {section.body}
            </p>
          ) : null}
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item) => (
            <article
              key={item.title}
              className="rounded-2xl border border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] p-6"
            >
              <CircleCheckBig className="h-6 w-6 text-sky-700" />
              <h3 className="mt-6 text-xl font-bold tracking-[-0.025em]">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SearchWorkflow({
  section,
}: {
  section: SearchLandingConfig["workflow"];
}) {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <div className="max-w-3xl">
          <div className="marketing-eyebrow">
            {section.eyebrow ?? "Workflow"}
          </div>
          <h2 className="marketing-heading mt-4">{section.heading}</h2>
          {section.body ? (
            <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">
              {section.body}
            </p>
          ) : null}
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {section.steps.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black tracking-[0.12em] text-sky-700">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index < section.steps.length - 1 ? (
                  <ChevronRight className="hidden h-5 w-5 text-slate-300 xl:block" />
                ) : null}
              </div>
              <h3 className="mt-8 text-xl font-bold">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function SearchProductProof({
  section,
}: {
  section: SearchLandingConfig["productProof"];
}) {
  return (
    <section className="border-y border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
        <div>
          <div className="marketing-eyebrow">
            {section.eyebrow ?? "Product proof"}
          </div>
          <h2 className="marketing-heading mt-4">{section.heading}</h2>
          {section.body ? (
            <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">
              {section.body}
            </p>
          ) : null}
          <div className="mt-8 space-y-4">
            {section.items.map((item) => (
              <article key={item.title} className="flex gap-4">
                <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800">
                  <Check size={16} />
                </span>
                <div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-[color:var(--marketing-muted)]">
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-[#07111f] shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
          {section.media ? (
            <>
              <Image
                src={section.media.src}
                alt={section.media.alt}
                width={section.media.width}
                height={section.media.height}
                className="h-auto w-full"
              />
              {section.media.caption ? (
                <p className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-slate-400">
                  {section.media.caption}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center p-8 text-center">
              <div>
                <ProFixIQMark className="mx-auto h-14 w-14" />
                <div className="mt-6 text-sm font-bold uppercase tracking-[0.18em] text-sky-300">
                  Product media slot
                </div>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-400">
                  Add a real ProFixIQ screenshot or workflow image when the search
                  page is authored.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function SearchComparison({
  section,
}: {
  section: NonNullable<SearchLandingConfig["comparison"]>;
}) {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-8">
        <div className="max-w-3xl">
          <div className="marketing-eyebrow">
            {section.eyebrow ?? "Compare the workflow"}
          </div>
          <h2 className="marketing-heading mt-4">{section.heading}</h2>
          {section.body ? (
            <p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">
              {section.body}
            </p>
          ) : null}
        </div>
        <div className="mt-10 overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] bg-white shadow-sm">
          <div className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] text-sm font-bold">
            <div className="p-4 sm:p-5">Capability</div>
            <div className="p-4 sm:p-5">ProFixIQ</div>
            <div className="p-4 sm:p-5">{section.alternativeLabel}</div>
          </div>
          {section.rows.map((row) => (
            <div
              key={row.capability}
              className="grid grid-cols-[1.15fr_1fr_1fr] border-b border-[color:var(--marketing-border)] text-sm last:border-b-0"
            >
              <div className="p-4 font-semibold sm:p-5">{row.capability}</div>
              <div className="p-4 text-[color:var(--marketing-muted)] sm:p-5">
                {row.profixiq}
              </div>
              <div className="p-4 text-[color:var(--marketing-muted)] sm:p-5">
                {row.alternative}
              </div>
            </div>
          ))}
        </div>
        {section.note ? (
          <p className="mt-4 text-xs leading-5 text-[color:var(--marketing-muted)]">
            {section.note}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function SearchFaq({ faqs }: { faqs: SearchLandingFaq[] }) {
  return (
    <section className="border-y border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-[920px] px-5 sm:px-8">
        <div className="marketing-eyebrow">Frequently asked questions</div>
        <h2 className="marketing-heading mt-4">Questions buyers usually ask.</h2>
        <div className="mt-10 divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)]">
          {faqs.map((faq) => (
            <article key={faq.question} className="py-6">
              <h3 className="text-lg font-bold">{faq.question}</h3>
              <p className="mt-3 text-sm leading-7 text-[color:var(--marketing-muted)]">
                {faq.answer}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SearchFinalCta({
  section,
}: {
  section: SearchLandingConfig["finalCta"];
}) {
  const primary = section.primary ?? defaultPrimaryCta;
  const secondary = section.secondary ?? defaultSecondaryCta;

  return (
    <section className="bg-[#07111f] py-20 text-white sm:py-24">
      <div className="mx-auto max-w-[980px] px-5 text-center sm:px-8">
        <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
          <Quote size={16} /> {section.eyebrow ?? "See the workflow in ProFixIQ"}
        </div>
        <h2 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {section.heading}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-300">
          {section.body}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={primary.href}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-bold text-[#07111f]"
          >
            {primary.label} <ArrowRight size={16} />
          </Link>
          <Link
            href={secondary.href}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3.5 text-sm font-bold"
          >
            {secondary.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function SearchLandingPage({
  config,
  structuredData,
}: {
  config: SearchLandingConfig;
  structuredData?: Record<string, unknown>;
}) {
  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <MarketingHeader />
      <main>
        <SearchHero config={config} />
        <SearchPainPoints section={config.painPoints} />
        <SearchWorkflow section={config.workflow} />
        <SearchProductProof section={config.productProof} />
        {config.comparison ? (
          <SearchComparison section={config.comparison} />
        ) : null}
        <SearchFaq faqs={config.faqs} />
        <SearchFinalCta section={config.finalCta} />
      </main>
      <Footer />
    </div>
  );
}
