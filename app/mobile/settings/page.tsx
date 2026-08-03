"use client";

import { Settings } from "lucide-react";

import MobileSettingsScreen from "@/features/mobile/settings/MobileSettingsScreen";

export default function MobileSettingsRoute() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-3 px-3 py-3 sm:px-4">
      <section className="mobile-dashboard-hero">
        <div className="flex items-start gap-3">
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#8ed4ff]">
            <Settings aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="mobile-dashboard-hero__eyebrow">Mobile settings</div>
            <h1 className="mobile-dashboard-hero__title">Account & preferences</h1>
            <p className="mobile-dashboard-hero__subtitle">
              Personal details, signature, workforce information and device preferences.
            </p>
          </div>
        </div>
      </section>
      <MobileSettingsScreen />
    </main>
  );
}
