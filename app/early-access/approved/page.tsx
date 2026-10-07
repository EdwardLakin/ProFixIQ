import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";

import EarlyAccessCheckoutButton from "@/features/shared/components/EarlyAccessCheckoutButton";
import {
  PRODUCT_PACKAGE_CATALOG,
  PRODUCT_PACKAGE_PRICING,
} from "@/features/stripe/lib/stripe/product-packages";
import {
  EARLY_ACCESS_DURATION_MONTHS,
  EARLY_ACCESS_PERCENT_OFF,
  EARLY_ACCESS_TRIAL_DAYS,
  findEarlyAccessGrantByToken,
} from "@/features/stripe/lib/server/early-access-discount";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = {
  referrer: "no-referrer",
};

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export default async function ApprovedEarlyAccessPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const token = first(params.token).trim();

  let grant: Awaited<ReturnType<typeof findEarlyAccessGrantByToken>> | null = null;
  let invalidReason = "This Early Access approval link is invalid or has expired.";
  if (token) {
    try {
      grant = await findEarlyAccessGrantByToken(token);
    } catch (error) {
      if (error instanceof Error && error.message) invalidReason = error.message;
    }
  }

  if (!grant) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
          <div className="text-sm font-black tracking-tight text-sky-300">ProFixIQ Early Access</div>
          <h1 className="mt-4 text-3xl font-black tracking-tight">Approval link unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{invalidReason}</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            If you were approved for Early Access, contact ProFixIQ for a new private signup link.
          </p>
          <Link href="/early-access" className="mt-6 inline-flex rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white">
            Back to Early Access
          </Link>
        </div>
      </main>
    );
  }

  const catalog = PRODUCT_PACKAGE_CATALOG[grant.productPackage];
  const regularMonthlyCents = PRODUCT_PACKAGE_PRICING[grant.productPackage].monthlyCents;
  const discountedMonthlyCents = Math.round(regularMonthlyCents * (100 - EARLY_ACCESS_PERCENT_OFF) / 100);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-black tracking-tight">ProFix<span className="text-sky-400">IQ</span></Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Approved Early Access
          </div>
        </div>

        <section className="overflow-hidden rounded-3xl border border-sky-500/20 bg-gradient-to-b from-sky-500/10 to-white/[0.035] shadow-2xl">
          <div className="p-6 sm:p-9">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Private offer for {grant.companyName}</div>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Your ProFixIQ Early Access offer is ready.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              You were approved for <strong className="text-white">{catalog.name}</strong>. Your private signup is locked to this package and the email used on your Early Access application.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-bold text-slate-400">Trial</div>
                <div className="mt-1 text-xl font-black">{EARLY_ACCESS_TRIAL_DAYS} days free</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-bold text-slate-400">Then</div>
                <div className="mt-1 text-xl font-black text-sky-300">{EARLY_ACCESS_PERCENT_OFF}% off</div>
                <div className="mt-1 text-xs text-slate-400">for {EARLY_ACCESS_DURATION_MONTHS} paid months</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-bold text-slate-400">Early Access base price</div>
                <div className="mt-1 text-xl font-black">{money(discountedMonthlyCents)} USD<span className="text-xs font-semibold text-slate-400">/mo</span></div>
                <div className="mt-1 text-xs text-slate-500">Regularly {money(regularMonthlyCents)} USD/mo</div>
              </div>
            </div>

            <div className="mt-7 rounded-2xl border border-sky-500/20 bg-sky-500/[0.07] p-4">
              <div className="font-bold">{catalog.name}</div>
              <p className="mt-1 text-sm leading-6 text-slate-300">{catalog.description}</p>
            </div>

            <div className="mt-7 flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-400">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
              <p>
                The 30% Early Access discount applies to the approved base subscription for the first six paid monthly billing periods after the free trial. Additional users, service trucks, fleet assets, usage-based services, and separately priced premium AI products are billed at their standard rates. Standard pricing applies after the six discounted months.
              </p>
            </div>

            <div className="mt-8">
              <EarlyAccessCheckoutButton token={token} />
              <p className="mt-3 text-xs text-slate-500">
                Secure checkout is handled by Stripe. Base prices shown above are USD; Stripe may present a converted local-currency amount at checkout. A payment method is collected now; the subscription trial starts before the first discounted paid period.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
