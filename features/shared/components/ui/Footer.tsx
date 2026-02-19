"use client";

import { cn } from "@shared/lib/utils";

const COPPER_LIGHT = "var(--accent-copper-light)";

export default function Footer({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      {/* PRE-FOOTER CTA BAND */}
      <div className="mx-auto max-w-6xl px-4">
        <div className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-6 backdrop-blur-xl">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full blur-3xl"
            style={{ background: "rgba(197,122,74,0.12)" }}
          />
          <div
            className="pointer-events-none absolute -left-28 -bottom-28 h-96 w-96 rounded-full blur-3xl"
            style={{ background: "rgba(15,23,42,0.42)" }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.00) 3px, rgba(0,0,0,0.45) 9px)",
            }}
          />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                Quick truth
              </div>
              <div className="mt-2 text-base font-extrabold text-white sm:text-lg">
                If you’re still reading, you’re already wasting time. Let ProFixIQ set the shop up for you.
              </div>
              <div className="mt-2 text-sm text-neutral-300">
                Get a workflow that fits fleet reality — inspections → quotes → parts → approvals → portal.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-black/25 px-5 py-2 text-sm font-semibold text-neutral-200 hover:border-white/20 hover:bg-black/35"
              >
                See what’s included
              </a>
              <a
                href="#"
                className="inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-extrabold text-black"
                style={{
                  backgroundColor: "rgba(197,122,74,0.95)",
                  boxShadow: "0 0 30px rgba(197,122,74,0.25)",
                }}
              >
                Run Instant Shop Analysis
              </a>
            </div>
          </div>

          {/* hint strip for future: socials + reviews */}
          <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <div className="text-xs text-neutral-500">
              Next: social links + verified shop reviews
            </div>
            <div className="text-xs text-neutral-500">
              <span style={{ color: COPPER_LIGHT }}>ProFixIQ</span> • Heavy-duty &amp; fleet shop OS
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer
        className={cn(
          "w-full text-center py-8 px-4 border-t border-white/10",
          "bg-black/25 backdrop-blur-xl text-neutral-400 text-sm transition-all",
          "hover:text-white",
        )}
      >
        <p className="font-mono tracking-wide text-xs sm:text-sm">
          © {new Date().getFullYear()}{" "}
          <span className="font-semibold" style={{ color: COPPER_LIGHT }}>
            ProFixIQ
          </span>
          . Built for pros, powered by AI.
        </p>
      </footer>
    </div>
  );
}