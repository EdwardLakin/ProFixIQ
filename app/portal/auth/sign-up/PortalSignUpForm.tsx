"use client";

import Link from "next/link";
import { MailCheck, QrCode, Wrench } from "lucide-react";
import AuthShell from "@/features/auth/components/AuthShell";

const steps = [
  {
    icon: Wrench,
    title: "From a work order",
    body: "Your shop emails a secure invitation with your customer and vehicle details already linked.",
  },
  {
    icon: QrCode,
    title: "From a shop QR code",
    body: "Scan the customer portal card at the shop and verify the email you want to use.",
  },
  {
    icon: MailCheck,
    title: "Create your password",
    body: "Open the one-time email, set a password, and continue into your portal.",
  },
];

export default function PortalSignUpForm() {
  return (
    <AuthShell
      productLabel="Customer portal"
      heroTitle="Your service, all in one place."
      heroDescription="Portal accounts stay connected to the right shop, customer, vehicles, and work orders from the moment they are activated."
      highlights={["Invite protected", "Email verified", "Shop connected"]}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
        Customer portal
      </div>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[color:var(--theme-text-primary)]">
        Activate portal access
      </h1>
      <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
        Customer accounts are created from a shop invitation or a verified shop
        QR code. This keeps your records private and correctly linked.
      </p>

      <div className="mt-6 space-y-3">
        {steps.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex gap-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3.5"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:color-mix(in_srgb,var(--accent-copper)_13%,transparent)] text-[var(--accent-copper)]">
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                {title}
              </div>
              <p className="mt-0.5 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <Link
          href="/portal/auth/sign-in"
          className="rounded-xl bg-[var(--accent-copper)] px-4 py-3 text-center text-sm font-bold text-[color:var(--theme-text-on-accent)]"
        >
          I already activated
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-3 text-center text-sm font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
        >
          Back to ProFixIQ
        </Link>
      </div>
      <p className="mt-4 text-center text-[11px] leading-5 text-[color:var(--theme-text-muted)]">
        Portal activation requires agreement to the{" "}
        <Link
          href="/legal/portal-terms"
          className="font-semibold text-[var(--accent-copper)] hover:underline"
        >
          Portal Terms
        </Link>{" "}
        and acknowledgement of the{" "}
        <Link
          href="/legal/privacy"
          className="font-semibold text-[var(--accent-copper)] hover:underline"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </AuthShell>
  );
}
