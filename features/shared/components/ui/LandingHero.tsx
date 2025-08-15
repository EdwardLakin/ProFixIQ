"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import Head from "next/head";
import { PRICE_IDS } from "@stripe/lib/stripe/constants";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// tsParticles v3
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, RecursivePartial, IOptions } from "@tsparticles/engine";

type PlanKey = "free" | "diy" | "pro" | "pro_plus";

export default function LandingHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // UI state
  const [, setFadeIn] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [isYearly, setIsYearly] = useState(false);
  const [, setLoading] = useState(false);

  // ✅ proper Supabase client for client components
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const router = useRouter();

  // dynamic portal link based on session (signed-in → /portal/booking)
  const [portalHref, setPortalHref] = useState<string>("/auth?redirect=/portal/booking");

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "auto";
    };
  }, []);

  // simple canvas glow bg
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * 400,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      radius: Math.random() * 2 + 1,
      alpha: Math.random(),
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        p.alpha += (Math.random() - 0.5) * 0.05;
        p.alpha = Math.max(0.2, Math.min(1, p.alpha));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 100, ${p.alpha})`;
        ctx.fill();
      }
      requestAnimationFrame(animate);
    };

    canvas.width = window.innerWidth;
    canvas.height = 400;
    animate();
  }, []);

  // fade trigger on scroll
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 300) setFadeIn(true);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Compute portal href based on session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setPortalHref("/portal/booking");
    });
  }, [supabase]);

  const handleExpand = (index: number) => {
    setExpandedIndex(index === expandedIndex ? null : index);
  };

  const saveSelectedPlan = async (plan: PlanKey) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("profiles").update({ plan }).eq("id", user.id);
  };

  const handleCheckout = async (plan: PlanKey) => {
    setSelectedPlan(plan);
    setLoading(true);
    await saveSelectedPlan(plan);

    const priceId =
      isYearly ? PRICE_IDS[plan]?.yearly : PRICE_IDS[plan]?.monthly;

    if (!priceId) {
      alert("Invalid plan selected.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planKey: priceId,
        interval: isYearly ? "yearly" : "monthly",
      }),
    });

    const { url } = (await res.json()) as { url?: string };
    if (url) window.location.href = url;
    else alert("Failed to redirect");

    setLoading(false);
  };

  // tsParticles v3 wiring
  useEffect(() => {
    void initParticlesEngine(async (engine: Engine) => {
      await loadSlim(engine);
    });
  }, []);

  const particlesOptions: RecursivePartial<IOptions> = {
    fullScreen: { enable: false },
    background: { color: { value: "transparent" } },
    detectRetina: true,
    fpsLimit: 60,
    interactivity: {
      events: {
        onHover: { enable: true, mode: "repulse" },
        onClick: { enable: true, mode: "push" },
        resize: { enable: true },
      },
      modes: {
        repulse: { distance: 120, duration: 0.3 },
        push: { quantity: 3 },
      },
    },
    particles: {
      number: { value: 80 },
      color: { value: ["#ff6a00", "#ffd700"] },
      shape: { type: "circle" },
      opacity: { value: { min: 0.3, max: 0.8 } },
      size: { value: { min: 1, max: 3 } },
      links: {
        enable: true,
        distance: 140,
        opacity: 0.35,
        width: 1,
        color: { value: "#ffb347" },
      },
      move: {
        enable: true,
        speed: 0.6,
        direction: "none",
        outModes: { default: "bounce" },
        random: false,
        straight: false,
      },
    },
  };

  const features = [
    {
      title: "AI-Powered Diagnostics",
      subtitle: "Get instant fault predictions",
      content:
        "Use machine learning to narrow down issues before you start. Chat with the AI to confirm symptoms and get a starting point.",
    },
    {
      title: "Inspection System",
      subtitle: "Customizable forms & checklists",
      content:
        "Create custom inspections with photos, voice notes, and tags. Perfect for shops or DIY records.",
    },
    {
      title: "Work Orders & Quotes",
      subtitle: "Professional service workflows",
      content:
        "Build and manage jobs, assign tasks, estimate time and cost, and generate PDFs to share with customers.",
    },
    {
      title: "Voice Control + Photos",
      subtitle: "Hands-free inspections",
      content:
        "Add line items by voice, attach photos with markup and annotations, and convert visuals into quotes.",
    },
    {
      title: "Shop + Team Management",
      subtitle: "Role-based collaboration",
      content:
        "Set up teams with admin/tech/advisor roles, manage multiple jobs and users with ease.",
    },
    {
      title: "Priority Support & Add-ons",
      subtitle: "White-glove assistance",
      content:
        "Get premium support and optional add-ons like additional users for Pro+ at $49/mo each.",
    },
  ] as const;

  return (
    <>
      <Head>
        <title>ProFixIQ – Repair Smarter</title>
        <meta
          name="description"
          content="AI-powered diagnostics and shop management for auto pros"
        />
        <meta property="og:title" content="ProFixIQ" />
        <meta
          property="og:description"
          content="AI-powered diagnostics and workflow for mechanics"
        />
      </Head>

      {/* simple canvas glow */}
      <canvas ref={canvasRef} className="absolute top-0 left-0 z-0" />

      <section className="relative overflow-hidden bg-black text-white pt-24 pb-32 px-6 sm:px-12 lg:px-24">
        {/* tsParticles layer behind text */}
        <div className="absolute inset-0 z-[-1] pointer-events-none">
          <Particles id="hero-particles" options={particlesOptions} />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <p className="text-xl text-[#ff6a00] font-bold mb-2 tracking-wide uppercase">
            Repair Smarter. Diagnose Faster.
          </p>
          <h1 className="font-blackops text-[6.5rem] sm:text-[8rem] leading-[1.1] text-transparent bg-gradient-to-r from-[#ff6a00] to-[#ffd700] bg-clip-text drop-shadow-[0_0_35px_rgba(255,106,0,0.6)] mb-6">
            ProFixIQ
          </h1>
          <p className="text-lg text-neutral-300 max-w-3xl mx-auto mb-10">
            From diagnostics to dispatch — AI handles the heavy lifting.
            Streamline every repair, inspection, and work order with smart
            automation.
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            {/* Portal CTA — uses portalHref computed from session */}
            <Link
              href={portalHref}
              className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-6 rounded-lg text-lg shadow-lg transition"
            >
              Book Service
            </Link>

            <Link
              href="/sign-in?redirectedFrom=/ai"
              className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-6 rounded-lg text-lg shadow-lg transition"
            >
              Try the AI
            </Link>
            <button
              onClick={() => scrollTo("plans")}
              className="border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-bold py-3 px-6 rounded-lg text-lg shadow-md transition"
            >
              Compare Plans
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="border border-white text-white hover:bg-white hover:text-black font-bold py-3 px-6 rounded-lg text-lg shadow-md transition"
            >
              Explore Features
            </button>
            <button
              onClick={() => scrollTo("why")}
              className="border border-white text-white hover:bg-white hover:text-black font-bold py-3 px-6 rounded-lg text-lg shadow-md transition"
            >
              Why ProFixIQ?
            </button>
          </div>
        </div>
      </section>

      <section id="features" className="pt-20 px-6 max-w-5xl mx-auto text-white">
        <h2 className="text-4xl font-blackops text-center mb-10 text-orange-400 drop-shadow-lg">
          Powerful Features
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              onClick={() => handleExpand(i)}
              className={`border-2 border-orange-500 rounded-xl p-6 cursor-pointer hover:bg-neutral-900 transition-all shadow-md hover:shadow-orange-600/30 ${
                expandedIndex === i ? "bg-neutral-900" : "bg-black/30"
              }`}
            >
              <h3 className="text-xl text-orange-400 font-blackops mb-1">{f.title}</h3>
              <p className="text-sm text-gray-300 mb-2 italic">{f.subtitle}</p>
              {expandedIndex === i && (
                <p className="text-sm text-white">{f.content}</p>
              )}
            </div>
          ))}
        </div>
        <p className="text-center mt-6 text-gray-400">More questions? Ask the chatbot!</p>
      </section>

      <section id="why" className="py-20 bg-neutral-950 text-white px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-3xl font-blackops text-orange-400 mb-6 drop-shadow">
            Why ProFixIQ?
          </h2>
          <p className="text-lg text-gray-300 leading-relaxed">
            ProFixIQ was built by a technician who lived the shop life — not a
            corporate product manager. We know the real bottlenecks: the hours
            spent at a desk quoting jobs, chasing approvals, writing work
            orders, and double-checking inspections. That’s why we built
            ProFixIQ to be your digital assistant — AI-powered, voice-enabled,
            and built to streamline everything from diagnostics to dispatch.
            Whether you’re a solo tech or running a full shop, ProFixIQ reduces
            screen time, speeds up workflows, and gives you more time to do what
            you do best — Repair vehicles.
          </p>
        </div>
      </section>

      <section id="plans" className="py-20 bg-neutral-900 px-6 text-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-blackops text-orange-400 text-center mb-8 drop-shadow">
            Choose Your Plan
          </h2>

          <div className="flex justify-center mb-6 gap-4">
            <button
              onClick={() => setIsYearly(false)}
              className={`px-4 py-2 rounded font-blackops ${
                !isYearly ? "bg-orange-500 text-black" : "bg-neutral-700 text-gray-300"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsYearly(true)}
              className={`px-4 py-2 rounded font-blackops ${
                isYearly ? "bg-orange-500 text-black" : "bg-neutral-700 text-gray-300"
              }`}
            >
              Yearly
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {[
              {
                name: "Free",
                key: "free",
                price: "$0",
                description: "Try the basics",
                features: ["5 AI uses", "No inspections", "1 vehicle", "No support"],
              },
              {
                name: "DIY",
                key: "diy",
                price: isYearly ? "$90/year" : "$9/month",
                description: "For home users",
                features: ["Basic AI", "Limited inspections", "Photo upload", "Email support"],
              },
              {
                name: "Pro",
                key: "pro",
                price: isYearly ? "$490/year" : "$49/month",
                description: "For solo pros",
                features: ["Unlimited AI", "Voice & photo", "PDF export", "1 user"],
              },
              {
                name: "Pro+",
                key: "pro_plus",
                price: isYearly ? "$990/year" : "$99/month",
                description: "For teams",
                features: ["All features", "5 users", "Admin/Tech roles", "+$49/user addon"],
              },
            ].map((plan) => (
              <button
                key={plan.key}
                onClick={async () => {
                  if (plan.key === "free") {
                    await saveSelectedPlan("free");
                    router.push("/onboarding/profile");
                  } else {
                    void handleCheckout(plan.key as PlanKey);
                  }
                }}
                className={`border border-orange-500 p-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-left transition-all shadow hover:shadow-orange-600/20 ${
                  selectedPlan === plan.key ? "ring-2 ring-orange-500" : ""
                }`}
              >
                <h3 className="text-xl font-blackops text-orange-400">{plan.name}</h3>
                <p className="text-sm text-gray-300 mb-2">{plan.description}</p>
                <p className="text-lg text-orange-500 font-bold mb-4">{plan.price}</p>
                <ul className="text-sm text-gray-300 space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i}>✓ {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-black border-t border-neutral-800 mt-16 py-10 text-center text-sm text-gray-500 relative">
        <div className="max-w-7xl mx-auto px-4">
          <div className="mb-4">
            <span className="font-blackops text-lg text-orange-500 tracking-wide">
              ProFixIQ
            </span>
          </div>
          <div className="flex flex-col md:flex-row justify-center items-center gap-6 text-gray-400 text-sm mb-4">
            <Link href="/" className="hover:text-orange-400 transition-all duration-200">
              Home
            </Link>
            <Link href="/subscribe" className="hover:text-orange-400 transition-all duration-200">
              Plans
            </Link>
            <Link href="/dashboard" className="hover:text-orange-400 transition-all duration-200">
              Dashboard
            </Link>
            <a
              href="mailto:support@profixiq.com"
              className="hover:text-orange-400 transition-all duration-200"
            >
              Support
            </a>
          </div>
          <p className="text-gray-600 font-mono">
            &copy; {new Date().getFullYear()} ProFixIQ. Built for techs, by a tech.
          </p>
        </div>

        <button
          onClick={() => {
            const chatbot = document.getElementById("chatbot-button");
            if (chatbot) chatbot.click();
          }}
          className="fixed bottom-6 right-6 z-50 bg-orange-500 hover:bg-orange-600 text-black font-blackops px-4 py-3 rounded-full shadow-lg transition-all duration-300"
        >
          Ask AI
        </button>
      </footer>
    </>
  );
}