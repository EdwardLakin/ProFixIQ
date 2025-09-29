import Header from "@/features/landing/Header";
import Hero from "@/features/landing/Hero";
import Features from "@/features/landing/Features";
import CTA from "@/features/landing/CTA";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Landing() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <Header />
      <main>
        <Hero />
        <Features />
        <CTA />
      </main>
      <footer className="px-safe py-8 text-center text-xs text-white/50">
        © {new Date().getFullYear()} ProFixIQ
      </footer>
    </div>
  );
}
