import Link from "next/link";
import type { LegalDocumentContent } from "@/features/legal/lib/content";
import {
  LEGAL_CONTACT,
  LEGAL_DRAFT_DATE,
  LEGAL_REVIEW_STATUS,
} from "@/features/legal/lib/config";

export default function LegalDocumentPage({
  content,
}: {
  content: LegalDocumentContent;
}) {
  return (
    <article className="mx-auto w-full max-w-4xl rounded-[1.75rem] border border-[color:var(--theme-border-soft)] bg-[color:color-mix(in_srgb,var(--theme-surface-overlay)_94%,transparent)] p-5 shadow-[var(--theme-shadow-strong)] backdrop-blur-xl sm:p-8 lg:p-10">
      <div className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
        Draft for counsel review
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--theme-text-primary)] sm:text-5xl">
        {content.document.title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-[color:var(--theme-text-secondary)]">
        {content.summary}
      </p>

      <dl className="mt-6 grid gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            Status
          </dt>
          <dd className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {LEGAL_REVIEW_STATUS}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            Version
          </dt>
          <dd className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {content.document.version}
          </dd>
        </div>
        <div>
          <dt className="uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">
            Draft date
          </dt>
          <dd className="mt-1 font-semibold text-[color:var(--theme-text-primary)]">
            {LEGAL_DRAFT_DATE}
          </dd>
        </div>
      </dl>

      <div className="mt-10 space-y-10">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-xl font-semibold tracking-[-0.025em] text-[color:var(--theme-text-primary)] sm:text-2xl">
              {section.heading}
            </h2>
            {section.paragraphs?.map((paragraph) => (
              <p
                key={paragraph}
                className="mt-3 text-sm leading-7 text-[color:var(--theme-text-secondary)] sm:text-[15px]"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-4 space-y-2.5 pl-5 text-sm leading-7 text-[color:var(--theme-text-secondary)] sm:text-[15px]">
                {section.bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="list-disc pl-1 marker:text-[var(--accent-copper)]"
                  >
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">
        This document is not effective. It is a proposed Canadian launch draft
        that must be approved by counsel and reconciled with production
        operations, provider contracts and the exact legal entity before public
        launch.
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-6 text-xs text-[color:var(--theme-text-muted)]">
        <Link
          href="/legal"
          className="font-semibold text-[var(--accent-copper)] hover:underline"
        >
          Back to Legal Centre
        </Link>
        <span>Questions: {LEGAL_CONTACT.supportEmail}</span>
      </div>
    </article>
  );
}
