import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";

export const metadata: Metadata = {
  title: "Early Access Checkout Cancelled | ProFixIQ",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function EarlyAccessCheckoutCancelledPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-16 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-2 text-sm font-black tracking-tight text-sky-300">
          <LockKeyhole className="h-4 w-4" /> ProFixIQ Early Access
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight">Checkout cancelled</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          No subscription was started from this checkout attempt. To continue your approved Early Access offer, reopen the private signup link you received from ProFixIQ.
        </p>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          For security, the private approval token is never placed in the Stripe cancellation URL.
        </p>
        <Link
          href="/early-access"
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Early Access
        </Link>
      </div>
    </main>
  );
}
