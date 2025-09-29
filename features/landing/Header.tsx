"use client";
import Link from "next/link";
import { useState } from "react";

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-black/70 px-safe backdrop-blur supports-[backdrop-filter]:bg-black/50">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-black tracking-wide text-orange-400" style={{ fontFamily: "var(--font-blackops)" }}>
          ProFixIQ
        </Link>
        <nav className="hidden gap-6 sm:flex">
          <Link href="#features" className="text-sm text-white/80 hover:text-white">Features</Link>
          <Link href="/compare-plans" className="text-sm text-white/80 hover:text-white">Plans</Link>
          <Link href="/support" className="text-sm text-white/80 hover:text-white">Support</Link>
          <Link href="/(app)/dashboard" className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15">Dashboard</Link>
        </nav>
        <button onClick={() => setOpen((v) => !v)} className="sm:hidden rounded-md p-2 hover:bg-white/10" aria-label="Toggle menu">
          ☰
        </button>
      </div>
      {open && (
        <div className="sm:hidden">
          <nav className="mx-auto grid max-w-7xl gap-1 px-4 pb-3 sm:px-6 lg:px-8">
            <Link onClick={()=>setOpen(false)} href="#features" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">Features</Link>
            <Link onClick={()=>setOpen(false)} href="/compare-plans" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">Plans</Link>
            <Link onClick={()=>setOpen(false)} href="/support" className="rounded-md px-3 py-2 text-sm hover:bg-white/10">Support</Link>
            <Link onClick={()=>setOpen(false)} href="/(app)/dashboard" className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">Dashboard</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
