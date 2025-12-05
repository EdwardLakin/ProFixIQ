"use client";

import Link from "next/link";
import { FaCheck, FaTimes } from "react-icons/fa";

export default function ComparePlansPage() {
  const features = [
    "AI Diagnosis & Tech Assistant",
    "Custom Inspection System ( mobile & desktop)",
    "Work Orders & Job Queue",
    "Voice-Controlled Inspections",
    "Photo-to-Quote & PDF Export",
    "Custom Inspection Creation",
    "Shop Setup & Team Roles",
    "Mobile Companion Access",
    "User Limit",
    "Priority Support",
  ];

  const plans = [
    {
      name: "Shop 30",
      price: "$300",
      tag: "Up to 30 users",
      description: "Full ProFixIQ stack for small & mid-size teams.",
      values: [
        // AI Diagnosis & Tech Assistant
        <FaCheck key="shop30-ai" className="mx-auto text-emerald-400" />,
        // Inspection System
        <FaCheck key="shop30-insp" className="mx-auto text-emerald-400" />,
        // Work Orders & Job Queue
        <FaCheck key="shop30-wo" className="mx-auto text-emerald-400" />,
        // Voice-Controlled Inspections
        <FaCheck key="shop30-voice" className="mx-auto text-emerald-400" />,
        // Photo-to-Quote & PDF Export
        <FaCheck key="shop30-photo" className="mx-auto text-emerald-400" />,
        // Custom Inspection Creation
        <FaCheck key="shop30-custom" className="mx-auto text-emerald-400" />,
        // Shop Setup & Team Roles
        <FaCheck key="shop30-roles" className="mx-auto text-emerald-400" />,
        // Mobile Companion Access
        <FaCheck key="shop30-mobile" className="mx-auto text-emerald-400" />,
        // User Limit
        <span
          key="shop30-users"
          className="text-xs font-medium text-neutral-100"
        >
          Up to 30 users
        </span>,
        // Priority Support
        <span
          key="shop30-support"
          className="text-xs font-medium text-neutral-300"
        >
          Standard
        </span>,
      ],
    },
    {
      name: "Unlimited Shop",
      price: "$500",
      tag: "Unlimited users",
      description: "Larger teams, multi-bay shops & power users.",
      values: [
        // AI Diagnosis & Tech Assistant
        <FaCheck key="unlim-ai" className="mx-auto text-emerald-400" />,
        // Inspection System
        <FaCheck key="unlim-insp" className="mx-auto text-emerald-400" />,
        // Work Orders & Job Queue
        <FaCheck key="unlim-wo" className="mx-auto text-emerald-400" />,
        // Voice-Controlled Inspections
        <FaCheck key="unlim-voice" className="mx-auto text-emerald-400" />,
        // Photo-to-Quote & PDF Export
        <FaCheck key="unlim-photo" className="mx-auto text-emerald-400" />,
        // Custom Inspection Creation
        <FaCheck key="unlim-custom" className="mx-auto text-emerald-400" />,
        // Shop Setup & Team Roles
        <FaCheck key="unlim-roles" className="mx-auto text-emerald-400" />,
        // Mobile Companion Access
        <FaCheck key="unlim-mobile" className="mx-auto text-emerald-400" />,
        // User Limit
        <span
          key="unlim-users"
          className="text-xs font-medium text-neutral-100"
        >
          Unlimited users
        </span>,
        // Priority Support
        <span
          key="unlim-support"
          className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
          Priority
        </span>,
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#1f2937_0,_#020617_55%,_#000000_100%)] px-4 py-12 text-white">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">
              ProFixIQ • Pricing
            </p>
            <h1 className="bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] bg-clip-text text-4xl font-blackops text-transparent sm:text-5xl">
              Shop Plans
            </h1>
            <p className="mt-2 max-w-xl text-sm text-neutral-300">
              One platform for inspections, work orders, AI diagnosis and the
              mobile tech companion. Choose the seat count that fits your shop.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-[var(--accent-copper-soft)] bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper-soft)] shadow-[0_0_16px_rgba(212,118,49,0.55)] hover:bg-[var(--accent-copper-faint)]"
          >
            ← Back to app
          </Link>
        </div>

        {/* Plans table */}
        <div className="overflow-x-auto rounded-2xl border border-[var(--metal-border-soft)] bg-black/60 backdrop-blur">
          <table className="w-full text-left text-sm">
            <thead className="bg-[linear-gradient(to_right,rgba(24,24,27,0.95),rgba(15,23,42,0.98))]">
              <tr>
                <th className="border-b border-[var(--metal-border-soft)] px-4 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Features
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.name}
                    className="border-b border-[var(--metal-border-soft)] px-4 py-4 text-center align-bottom"
                  >
                    <div className="inline-flex flex-col items-center gap-1 rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.3),_rgba(15,23,42,0.9))] px-4 py-3 shadow-[0_0_25px_rgba(212,118,49,0.45)]">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-300">
                        {plan.tag}
                      </span>
                      <div className="text-lg font-blackops text-white">
                        {plan.name}
                      </div>
                      <div className="text-sm font-semibold text-[var(--accent-copper-soft)]">
                        {plan.price}
                        <span className="text-xs text-neutral-400"> / month</span>
                      </div>
                      <p className="mt-1 max-w-[14rem] text-[11px] text-neutral-300">
                        {plan.description}
                      </p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, i) => (
                <tr
                  key={feature}
                  className={
                    i % 2 === 0
                      ? "bg-gradient-to-r from-black via-neutral-950 to-black"
                      : "bg-neutral-950/90"
                  }
                >
                  <td className="border-t border-[var(--metal-border-soft)] px-4 py-3 text-xs font-medium text-neutral-200">
                    {feature}
                  </td>
                  {plans.map((plan) => (
                    <td
                      key={plan.name + "-" + i}
                      className="border-t border-[var(--metal-border-soft)] px-4 py-3 text-center align-middle"
                    >
                      {plan.values[i] ?? (
                        <FaTimes className="mx-auto text-neutral-600" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* CTA */}
        <div className="mt-10 text-center">
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-8 py-3 text-sm font-blackops uppercase tracking-[0.26em] text-black shadow-[0_0_30px_rgba(212,118,49,0.8)] hover:brightness-110"
          >
            Get started with ProFixIQ
          </Link>
          <p className="mt-3 text-[11px] text-neutral-500">
            No per-inspection fees. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}