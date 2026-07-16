"use client";

import { useEffect } from "react";

export default function LaunchPage() {
  useEffect(() => {
    window.location.replace(navigator.onLine ? "/" : "/offline");
  }, []);
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
      <p className="text-sm uppercase tracking-[0.2em]">Opening ProFixIQ…</p>
    </main>
  );
}
