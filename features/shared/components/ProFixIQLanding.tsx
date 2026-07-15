"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  ClipboardCheck,
  FileCheck2,
  Menu,
  MessageSquareText,
  Mic,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import LandingHero from "@shared/components/ui/LandingHero";
import PricingSection from "@shared/components/ui/PricingSection";
import Footer from "@shared/components/ui/Footer";
import LandingChatbot from "@/features/landing/LandingChatbot";
import type { PlanKey } from "@/features/stripe/lib/stripe/constants";

type Interval = "monthly" | "yearly";

const workflow = [
  { number: "01", title: "Capture", body: "Technicians document voice notes, measurements, photos, and findings once.", icon: Mic },
  { number: "02", title: "Build", body: "Findings become complete repair lines with labor, parts, and evidence attached.", icon: Wrench },
  { number: "03", title: "Approve", body: "Customers and fleets make clear decisions from a live, evidence-backed portal.", icon: FileCheck2 },
  { number: "04", title: "Fulfill", body: "Approved work moves directly into parts, technician, and scheduling workflows.", icon: PackageCheck },
  { number: "05", title: "Complete", body: "Invoice, history, reporting, and fleet visibility close the loop cleanly.", icon: ClipboardCheck },
];

const stories = [
  {
    eyebrow: "Voice inspections",
    title: "Capture the real condition of the vehicle without slowing the technician down.",
    body: "Voice-guided inspections keep technicians working naturally. Photos, videos, notes, and measurements remain connected to the exact repair they support.",
    points: ["Hands-free inspection flow", "Evidence attached to durable records", "Custom automotive and heavy-duty templates"],
    icon: Mic,
    visual: "inspection",
  },
  {
    eyebrow: "Connected decisions",
    title: "Turn a technician’s finding into approved work without rebuilding the job.",
    body: "Advisors review one complete repair line. Customers and fleets see the evidence, approve the work, and trigger the next operational step.",
    points: ["Technician-built repairs", "Customer and fleet approvals", "No duplicate data entry"],
    icon: MessageSquareText,
    visual: "approval",
  },
  {
    eyebrow: "End-to-end operations",
    title: "Keep parts, people, billing, and history tied to the same source of truth.",
    body: "Every team works from the same job state—from request and receiving through completion, invoicing, reporting, and future service history.",
    points: ["Parts requests and receiving", "Workforce and dispatch visibility", "Clean billing and vehicle history"],
    icon: BarChart3,
    visual: "operations",
  },
] as const;

const roles = [
  { title: "Technicians", body: "Less typing, fewer interruptions, and one place to build the repair correctly.", icon: Wrench },
  { title: "Advisors", body: "Review evidence, send clear approvals, and see what is blocking every job.", icon: MessageSquareText },
  { title: "Parts", body: "Requests, quotes, orders, receiving, and allocations stay tied to the work.", icon: PackageCheck },
  { title: "Owners", body: "See operational readiness, workforce activity, and missed opportunity across the shop.", icon: BarChart3 },
  { title: "Customers & fleets", body: "Get evidence, decisions, live status, documents, and history through dedicated portals.", icon: Users },
];

const modules = [
  { title: "Repair Operations", items: "Work orders, quotes, inspections, approvals, invoicing", icon: Wrench },
  { title: "Parts & Inventory", items: "Requests, purchasing, receiving, allocations, inventory", icon: PackageCheck },
  { title: "Workforce Command", items: "Scheduling, attendance, readiness, documents, certifications", icon: Users },
  { title: "Portals & Intelligence", items: "Customer and fleet portals, history, AI assistance, reporting", icon: Building2 },
];

function ProductVisual({ type }: { type: (typeof stories)[number]["visual"] }) {
  if (type === "inspection") {
    return (
      <div className="rounded-[1.5rem] border border-[color:var(--marketing-border)] bg-white p-5 shadow-[0_24px_60px_rgba(23,32,42,0.1)]">
        <div className="flex items-center justify-between border-b border-[color:var(--marketing-border)] pb-4">
          <div><div className="text-sm font-bold">Heavy-duty PM inspection</div><div className="mt-1 text-xs text-[color:var(--marketing-muted)]">Unit 47 • 12 sections</div></div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Live</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {["Steering", "Brakes", "Suspension", "Tires"].map((item, index) => (
            <div key={item} className={`rounded-xl border p-3 ${index === 1 ? "border-amber-200 bg-amber-50" : "border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)]"}`}>
              <div className="text-xs text-[color:var(--marketing-muted)]">Section {index + 1}</div>
              <div className="mt-1 text-sm font-bold text-[color:var(--marketing-ink)]">{item}</div>
              <div className={`mt-3 h-1.5 rounded-full ${index === 1 ? "bg-amber-400" : "bg-emerald-500"}`} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-[color:var(--marketing-ink)] p-3.5 text-white"><Mic size={17} /><div className="text-sm font-semibold">Listening for the next finding…</div></div>
      </div>
    );
  }

  if (type === "approval") {
    return (
      <div className="rounded-[1.5rem] border border-[color:var(--marketing-border)] bg-white p-5 shadow-[0_24px_60px_rgba(23,32,42,0.1)]">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--marketing-muted)]">Customer approval</div>
        <div className="mt-4 rounded-2xl border border-[color:var(--marketing-border)] p-4">
          <div className="flex items-start justify-between gap-3"><div><div className="font-bold text-[color:var(--marketing-ink)]">Replace front brake pads & rotors</div><div className="mt-1 text-xs text-[color:var(--marketing-muted)]">Safety • Recommended today</div></div><div className="font-bold text-[color:var(--marketing-ink)]">$1,284</div></div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {["Photo", "Measurement", "Tech note"].map((item) => <div key={item} className="rounded-lg bg-[color:var(--marketing-stone)] p-2.5 text-center text-[11px] font-semibold text-[color:var(--marketing-muted)]">{item}</div>)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg border border-[color:var(--marketing-border)] px-3 py-2 text-center text-xs font-bold">Decline</div><div className="rounded-lg bg-[color:var(--marketing-copper)] px-3 py-2 text-center text-xs font-bold text-white">Approve repair</div></div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck size={15} /> Decision recorded with a complete audit trail</div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] border border-[color:var(--marketing-border)] bg-white p-5 shadow-[0_24px_60px_rgba(23,32,42,0.1)]">
      <div className="flex items-center justify-between"><div><div className="text-sm font-bold text-[color:var(--marketing-ink)]">Today’s operation</div><div className="mt-1 text-xs text-[color:var(--marketing-muted)]">One live view across the shop</div></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">24 active</span></div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[{ n: "8", l: "In progress" }, { n: "5", l: "Awaiting parts" }, { n: "11", l: "Ready" }].map((stat) => <div key={stat.l} className="rounded-xl bg-[color:var(--marketing-stone)] p-3"><div className="text-2xl font-bold text-[color:var(--marketing-ink)]">{stat.n}</div><div className="mt-1 text-[10px] font-semibold text-[color:var(--marketing-muted)]">{stat.l}</div></div>)}
      </div>
      <div className="mt-4 space-y-2.5">
        {[{ label: "Parts fulfillment", value: "82%", width: "82%" }, { label: "Technician capacity", value: "74%", width: "74%" }, { label: "Approval completion", value: "91%", width: "91%" }].map((row) => <div key={row.label}><div className="flex justify-between text-xs"><span className="font-semibold text-[color:var(--marketing-muted)]">{row.label}</span><span className="font-bold text-[color:var(--marketing-ink)]">{row.value}</span></div><div className="mt-1.5 h-2 rounded-full bg-[color:var(--marketing-stone)]"><div className="h-full rounded-full bg-[color:var(--marketing-steel)]" style={{ width: row.width }} /></div></div>)}
      </div>
    </div>
  );
}

export default function ProFixIQLanding() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [sessionExists, setSessionExists] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    void supabase.auth.getSession().then(({ data }) => setSessionExists(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSessionExists(Boolean(session)));
    unsubscribe = () => data.subscription.unsubscribe();
    return () => unsubscribe?.();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const startCheckout = async ({ planKey, interval }: { planKey: PlanKey; interval: Interval }) => {
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "pricing_cta", planKey, interval, enableTrial: true, applyFoundingDiscount: true, cancelPath: "/compare-plans" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.url) throw new Error(String(data?.error ?? data?.details ?? "Unable to start checkout"));
    window.location.href = data.url;
  };

  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--marketing-border)] bg-[rgba(247,245,241,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="ProFixIQ home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[color:var(--marketing-ink)] text-[10px] font-blackops tracking-[0.12em] text-white">PFQ</span>
            <span><span className="block text-base font-bold tracking-[-0.02em]">ProFixIQ</span><span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--marketing-muted)]">Shop operating system</span></span>
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
            {[{ href: "#workflow", label: "Workflow" }, { href: "#product", label: "Product" }, { href: "#shop-boost", label: "Shop Boost" }, { href: "#pricing", label: "Pricing" }].map((item) => <Link key={item.href} href={item.href} className="text-sm font-semibold text-[color:var(--marketing-muted)] transition hover:text-[color:var(--marketing-ink)]">{item.label}</Link>)}
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <Link href="/portal" className="text-sm font-semibold text-[color:var(--marketing-muted)] hover:text-[color:var(--marketing-ink)]">Portal sign-in</Link>
            {sessionExists ? <><Link href="/dashboard" className="rounded-xl border border-[color:var(--marketing-border-strong)] bg-white px-4 py-2.5 text-sm font-bold">Dashboard</Link><button type="button" onClick={() => void handleSignOut()} className="text-sm font-semibold text-[color:var(--marketing-muted)]">Sign out</button></> : <><Link href="/sign-in" className="px-2 text-sm font-semibold text-[color:var(--marketing-ink)]">Sign in</Link><Link href="/compare-plans" className="rounded-xl bg-[color:var(--marketing-copper)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[color:var(--marketing-copper-dark)]">Start free trial</Link></>}
          </div>

          <button type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--marketing-border)] bg-white sm:hidden" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Toggle navigation">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
        </div>
        {menuOpen ? <div className="border-t border-[color:var(--marketing-border)] bg-white px-5 py-5 sm:hidden"><div className="flex flex-col gap-4">{[{ href: "#workflow", label: "Workflow" }, { href: "#product", label: "Product" }, { href: "#shop-boost", label: "Shop Boost" }, { href: "#pricing", label: "Pricing" }, { href: "/portal", label: "Portal sign-in" }, { href: sessionExists ? "/dashboard" : "/sign-in", label: sessionExists ? "Dashboard" : "Sign in" }].map((item) => <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="text-sm font-bold">{item.label}</Link>)}<Link href="/compare-plans" className="mt-2 rounded-xl bg-[color:var(--marketing-copper)] px-4 py-3 text-center text-sm font-bold text-white">Start free trial</Link></div></div> : null}
      </header>

      <main>
        <LandingHero />

        <section id="workflow" className="scroll-mt-24 border-b border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div><div className="marketing-eyebrow">Connected workflow</div><h2 className="marketing-heading mt-4 max-w-xl">One job. One truth. Every team connected.</h2></div>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--marketing-muted)] lg:justify-self-end">ProFixIQ carries the work forward instead of asking each department to recreate it. Evidence, decisions, parts, labor, and status remain attached from first inspection to final invoice.</p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-[1.5rem] border border-[color:var(--marketing-border)] bg-[color:var(--marketing-border)] md:grid-cols-5">
              {workflow.map(({ number, title, body, icon: Icon }) => <div key={number} className="bg-white p-6 md:min-h-[250px]"><div className="flex items-center justify-between"><span className="text-xs font-bold tracking-[0.18em] text-[color:var(--marketing-copper-dark)]">{number}</span><Icon size={19} className="text-[color:var(--marketing-steel)]" /></div><h3 className="mt-10 text-xl font-bold tracking-[-0.025em]">{title}</h3><p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">{body}</p></div>)}
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <div className="mx-auto max-w-3xl text-center"><div className="marketing-eyebrow">Built around the repair</div><h2 className="marketing-heading mt-4">From technician evidence to a complete business record.</h2><p className="mt-5 text-lg leading-8 text-[color:var(--marketing-muted)]">The product follows how a real shop works—then removes the re-entry, blind spots, and disconnected handoffs.</p></div>
            <div className="mt-16 space-y-24">
              {stories.map((story, index) => <div key={story.eyebrow} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20"><div className={index % 2 === 1 ? "lg:order-2" : ""}><div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--marketing-border)] bg-white text-[color:var(--marketing-copper-dark)] shadow-sm"><story.icon size={20} /></div><div className="marketing-eyebrow mt-6">{story.eyebrow}</div><h3 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{story.title}</h3><p className="mt-5 text-base leading-7 text-[color:var(--marketing-muted)]">{story.body}</p><ul className="mt-6 space-y-3">{story.points.map((point) => <li key={point} className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-[color:var(--marketing-copper-soft)] text-[color:var(--marketing-copper-dark)]"><Check size={12} /></span>{point}</li>)}</ul></div><div className={index % 2 === 1 ? "lg:order-1" : ""}><ProductVisual type={story.visual} /></div></div>)}
            </div>
          </div>
        </section>

        <section className="border-y border-[color:var(--marketing-border)] bg-[color:var(--marketing-ink)] py-20 text-white sm:py-24">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8"><div className="max-w-3xl"><div className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--marketing-copper-light)]">One platform, every role</div><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Built for the people doing the work—and the people waiting on it.</h2></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-5">{roles.map(({ title, body, icon: Icon }) => <div key={title} className="bg-[color:var(--marketing-ink)] p-6"><Icon size={21} className="text-[color:var(--marketing-copper-light)]" /><h3 className="mt-8 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{body}</p></div>)}</div></div>
        </section>

        <section id="shop-boost" className="scroll-mt-24 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8"><div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"><div><div className="marketing-eyebrow">Shop Boost onboarding</div><h2 className="marketing-heading mt-4">Bring the shop you already have. Start with a system built around it.</h2><p className="mt-5 text-lg leading-8 text-[color:var(--marketing-muted)]">Import your existing data, preview what ProFixIQ understands, and activate a clean operational foundation with guided review at every important decision.</p><Link href="/demo/instant-shop-analysis" className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[color:var(--marketing-copper-dark)]">Run Instant Shop Analysis <ArrowRight size={15} /></Link></div><div className="grid gap-4 sm:grid-cols-3">{[{ n: "01", t: "Profile", b: "Tell us how your bays, people, and workflow operate.", icon: Building2 }, { n: "02", t: "Import", b: "Upload customers, vehicles, history, parts, and services.", icon: Upload }, { n: "03", t: "Preview", b: "Review the shop blueprint before anything is activated.", icon: Sparkles }].map(({ n, t, b, icon: Icon }) => <div key={n} className="rounded-2xl border border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold text-[color:var(--marketing-copper-dark)]">{n}</span><Icon size={18} className="text-[color:var(--marketing-steel)]" /></div><h3 className="mt-10 text-xl font-bold">{t}</h3><p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">{b}</p></div>)}</div></div></div>
        </section>

        <section id="modules" className="border-y border-[color:var(--marketing-border)] py-20 sm:py-24">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8"><div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="marketing-eyebrow">Complete platform</div><h2 className="marketing-heading mt-4 max-w-2xl">Everything included. No feature tax.</h2></div><p className="max-w-lg text-base leading-7 text-[color:var(--marketing-muted)]">Choose a plan by team size. The operating system stays complete at every level.</p></div><div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{modules.map(({ title, items, icon: Icon }) => <div key={title} className="rounded-2xl border border-[color:var(--marketing-border)] bg-white p-6 shadow-sm"><Icon size={21} className="text-[color:var(--marketing-copper-dark)]" /><h3 className="mt-8 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-[color:var(--marketing-muted)]">{items}</p></div>)}</div></div>
        </section>

        <section id="pricing" className="scroll-mt-24 bg-white py-20 sm:py-28"><div className="mx-auto max-w-[1400px] px-5 sm:px-8"><div className="mx-auto max-w-3xl text-center"><div className="marketing-eyebrow">Simple pricing</div><h2 className="marketing-heading mt-4">One complete product. Sized for your shop.</h2><p className="mt-5 text-lg leading-8 text-[color:var(--marketing-muted)]">All core features are included. Plans scale by the number of active users at each location.</p></div><div className="mt-12"><PricingSection onCheckout={startCheckout} onStartFree={() => { window.location.href = "/compare-plans"; }} /></div></div></section>
      </main>

      <LandingChatbot />
      <Footer />
    </div>
  );
}
