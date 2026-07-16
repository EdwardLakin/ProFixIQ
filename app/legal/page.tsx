import Link from "next/link";
import { LEGAL_CONTENT } from "@/features/legal/lib/content";
import { LEGAL_CONTACT, LEGAL_DRAFT_DATE } from "@/features/legal/lib/config";

export const metadata = {
  title: "Legal Centre | ProFixIQ",
  description:
    "ProFixIQ legal, privacy, data-processing and support documents.",
  robots: { index: false, follow: false },
};

const reviewChecklist = [
  "Confirm the exact registered entity, complete service address and authorized signer.",
  "Confirm Canadian launch provinces and whether any US or international users are in scope.",
  "Verify subscription, trial, renewal, cancellation and refund wording against Stripe.",
  "Verify provider entities, data-processing regions, transfer terms and subprocessor contracts.",
  "Approve the liability cap, indemnities, governing law and dispute language.",
  "Confirm every proposed retention period is implemented in production and backups.",
  "Review provincial repair authorization, estimate, invoice and consumer disclosures.",
  "Replace the draft version and status before enabling public signup.",
];

export default function LegalCentrePage() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="rounded-[1.75rem] border border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-surface-overlay)_94%,transparent)] p-6 shadow-[var(--theme-shadow-strong)] backdrop-blur-xl sm:p-10">
        <div className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
          Counsel-review package
        </div>
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
          Legal Centre
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[color:var(--theme-text-secondary)]">
          Proposed Alberta/Canada launch documents for ProFixIQ. Drafted{" "}
          {LEGAL_DRAFT_DATE}; none are effective until approved, finalized and
          matched to production operations.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(LEGAL_CONTENT).map(({ document, summary }) => (
            <Link
              key={document.slug}
              href={`/legal/${document.slug}`}
              className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent-copper)]"
            >
              <div className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                {document.title}
              </div>
              <p className="mt-2 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                {summary}
              </p>
              <div className="mt-4 text-xs font-semibold text-[var(--accent-copper)]">
                Review document →
              </div>
            </Link>
          ))}
        </div>
      </div>

      <section className="mt-8 rounded-[1.75rem] border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">
          Counsel and launch checklist
        </h2>
        <ul className="mt-5 grid gap-3 text-sm leading-6 text-[color:var(--theme-text-secondary)] md:grid-cols-2">
          {reviewChecklist.map((item) => (
            <li
              key={item}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-4 py-3"
            >
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-[color:var(--theme-text-secondary)]">
          Review contact:{" "}
          <a
            className="font-semibold text-[var(--accent-copper)] hover:underline"
            href={`mailto:${LEGAL_CONTACT.supportEmail}`}
          >
            {LEGAL_CONTACT.supportEmail}
          </a>
        </p>
      </section>
    </div>
  );
}
