"use client";

import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Mic,
  PackageCheck,
  ShieldCheck,
  Wrench,
} from "lucide-react";

const workflow = [
  { label: "Inspect", icon: Mic },
  { label: "Build", icon: Wrench },
  { label: "Approve", icon: Check },
  { label: "Fulfill", icon: PackageCheck },
];

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-[color:var(--marketing-border)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_14%,rgba(193,102,59,0.12),transparent_30%),radial-gradient(circle_at_10%_30%,rgba(53,91,117,0.08),transparent_28%)]" />

      <div className="relative mx-auto grid w-full max-w-[1400px] gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-28 lg:pt-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--marketing-border)] bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--marketing-copper-dark)] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--marketing-copper)]" />
            Heavy-Duty • Automotive • Fleet
          </div>

          <h1 className="mt-7 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-[color:var(--marketing-ink)] sm:text-6xl lg:text-[4.65rem]">
            The operating system for modern repair shops.
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-[color:var(--marketing-muted)] sm:text-xl">
            Voice inspections, technician-built repairs, automated approvals,
            parts workflows, workforce operations, and fleet transparency—connected
            in one system.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/compare-plans"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--marketing-copper)] px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(143,69,40,0.2)] transition hover:-translate-y-0.5 hover:bg-[color:var(--marketing-copper-dark)]"
            >
              Start 14-day free trial
              <ArrowRight size={16} />
            </Link>
            <Link
              href="#workflow"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[color:var(--marketing-border-strong)] bg-white px-5 py-3.5 text-sm font-bold text-[color:var(--marketing-ink)] transition hover:border-[color:var(--marketing-steel)] hover:bg-[color:var(--marketing-stone)]"
            >
              See the workflow
              <ChevronRight size={16} />
            </Link>
          </div>

          <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[color:var(--marketing-muted)]">
            {["Full platform included", "No feature gating", "Built for real shop flow"].map((item) => (
              <span key={item} className="inline-flex items-center gap-2">
                <Check size={15} className="text-[color:var(--marketing-copper)]" />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative lg:pl-4">
          <div className="absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(circle,rgba(193,102,59,0.11),transparent_67%)]" />
          <div className="overflow-hidden rounded-[1.75rem] border border-[color:var(--marketing-border-strong)] bg-white shadow-[0_32px_80px_rgba(23,32,42,0.14)]">
            <div className="flex items-center justify-between border-b border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[color:var(--marketing-ink)] text-[10px] font-blackops tracking-widest text-white">
                  PFQ
                </div>
                <div>
                  <div className="text-sm font-bold text-[color:var(--marketing-ink)]">Work order EL000284</div>
                  <div className="text-xs text-[color:var(--marketing-muted)]">2019 Ford F-550 • Unit 47</div>
                </div>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">In progress</span>
            </div>

            <div className="grid md:grid-cols-[0.9fr_1.1fr]">
              <div className="border-b border-[color:var(--marketing-border)] p-5 md:border-b-0 md:border-r">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--marketing-muted)]">Inspection</span>
                  <span className="text-xs font-semibold text-[color:var(--marketing-steel)]">12 of 16 complete</span>
                </div>
                <div className="mt-4 rounded-2xl bg-[color:var(--marketing-stone)] p-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--marketing-copper)] text-white">
                      <Mic size={18} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[color:var(--marketing-ink)]">Voice capture active</div>
                      <div className="text-xs text-[color:var(--marketing-muted)]">Evidence stays with the repair</div>
                    </div>
                  </div>
                  <div className="mt-4 flex h-8 items-center gap-1" aria-hidden>
                    {[8, 16, 11, 23, 15, 28, 18, 10, 22, 14, 25, 9, 17, 12, 20].map((height, index) => (
                      <span key={`${height}-${index}`} className="w-1 flex-1 rounded-full bg-[color:var(--marketing-copper)] opacity-70" style={{ height }} />
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-[color:var(--marketing-border)] px-3.5 py-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--marketing-ink)]"><ShieldCheck size={16} className="text-emerald-700" /> Front brakes</span>
                    <span className="text-xs font-bold text-emerald-700">Pass</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                    <span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--marketing-ink)]"><Camera size={16} className="text-red-700" /> Left outer tie rod</span>
                    <span className="text-xs font-bold text-red-700">Repair</span>
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--marketing-muted)]">Repair line</span>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Evidence attached</span>
                </div>
                <div className="mt-4 rounded-2xl border border-[color:var(--marketing-border)] p-4">
                  <div className="text-sm font-bold text-[color:var(--marketing-ink)]">Replace left outer tie rod end</div>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--marketing-muted)]">Excessive play confirmed during steering inspection. Photo and technician note included.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[color:var(--marketing-stone)] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--marketing-muted)]">Labor</div>
                      <div className="mt-1 text-sm font-bold text-[color:var(--marketing-ink)]">1.4 hours</div>
                    </div>
                    <div className="rounded-xl bg-[color:var(--marketing-stone)] p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--marketing-muted)]">Parts</div>
                      <div className="mt-1 text-sm font-bold text-[color:var(--marketing-ink)]">Requested</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-[color:var(--marketing-ink)] p-4 text-white">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-300"><Clock3 size={14} /> Customer decision</div>
                    <div className="mt-1 text-sm font-bold">Approval link ready</div>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-[color:var(--marketing-ink)]">Send</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 border-t border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] px-4 py-4">
              {workflow.map(({ label, icon: Icon }, index) => (
                <div key={label} className="relative flex flex-col items-center gap-2 text-center">
                  {index < workflow.length - 1 ? <span className="absolute left-[62%] top-4 h-px w-[76%] bg-[color:var(--marketing-border-strong)]" /> : null}
                  <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-[color:var(--marketing-border-strong)] bg-white text-[color:var(--marketing-copper-dark)]"><Icon size={14} /></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--marketing-muted)]">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
