import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal & Compliance | ProFixIQ",
};

const documents = [
  {
    href: "/legal/terms",
    title: "Terms of Service",
    description: "The subscription agreement between ProFixIQ and your shop.",
  },
  {
    href: "/legal/privacy",
    title: "Privacy Policy",
    description: "How ProFixIQ collects, uses, and protects personal information.",
  },
  {
    href: "/legal/dpa",
    title: "Data Processing Addendum",
    description: "Processor terms covering your customer and employee data.",
  },
  {
    href: "/legal/acceptable-use",
    title: "Acceptable Use Policy",
    description: "Prohibited uses of the ProFixIQ platform.",
  },
  {
    href: "/legal/subprocessors",
    title: "Subprocessor List",
    description: "Vendors who help us operate the Service.",
  },
  {
    href: "/legal/ai-voice",
    title: "AI & Voice Data Policy",
    description: "How AI-assisted and voice-transcription features handle data.",
  },
];

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen bg-[color:var(--marketing-ink,#0D172A)] text-white">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          href="/"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          &larr; Back to ProFixIQ
        </Link>

        <h1 className="mt-8 text-3xl font-semibold tracking-tight">
          Legal &amp; Compliance
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
          These documents are in draft form pending attorney review and are
          not yet final. Each document states its draft status at the top.
        </p>

        <ul className="mt-10 space-y-4">
          {documents.map((doc) => (
            <li key={doc.href}>
              <Link
                href={doc.href}
                className="block rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 transition hover:border-white/20 hover:bg-white/[0.06]"
              >
                <div className="font-semibold">{doc.title}</div>
                <div className="mt-1 text-sm text-slate-400">
                  {doc.description}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
