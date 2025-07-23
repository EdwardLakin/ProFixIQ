'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function LandingHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Smooth scrolling
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = 'auto';
    };
  }, []);

  // Particle animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const particles: { x: number; y: number; dx: number; dy: number; radius: number }[] = [];
    const numParticles = 40;
    const width = window.innerWidth;
    const height = 400;

    canvas.width = width;
    canvas.height = height;

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        dx: (Math.random() - 0.5) * 0.8,
        dy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2 + 1,
      });
    }

    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.dx;
        p.y += p.dy;

        if (p.x < 0 || p.x > width) p.dx *= -1;
        if (p.y < 0 || p.y > height) p.dy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 165, 0, 0.6)';
        ctx.fill();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative overflow-hidden bg-black text-white pt-20 pb-32 px-6 sm:px-12 lg:px-24">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none z-0"
      />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-blackops text-orange-500 mb-4">
          Welcome to ProFixIQ
        </h1>
        <p className="text-lg md:text-xl text-neutral-300 max-w-2xl mx-auto mb-6">
          Built for professionals and DIYers. Save time, diagnose smarter, and fix faster with AI-driven repair intelligence.
        </p>
        <p className="text-sm text-neutral-400 italic mb-10">
          “Reduce repair time by 40% with ProFixIQ’s all-in-one platform.”
        </p>

        <div className="flex justify-center gap-6 flex-wrap">
          <Link
            href="/sign-in?redirectedFrom=/ai"
            className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-3 px-6 rounded-lg text-lg"
          >
            Try the AI
          </Link>
          <button
            onClick={() => scrollTo('plans')}
            className="border border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-black font-bold py-3 px-6 rounded-lg text-lg"
          >
            Compare Plans
          </button>
          <button
            onClick={() => scrollTo('features')}
            className="border border-white text-white hover:bg-white hover:text-black font-bold py-3 px-6 rounded-lg text-lg"
          >
            Explore Features
          </button>
          <button
            onClick={() => scrollTo('faq')}
            className="border border-white text-white hover:bg-white hover:text-black font-bold py-3 px-6 rounded-lg text-lg"
          >
            Why ProFixIQ?
          </button>
        </div>
      </div>

      {/* Bottom waveform SVG (Option 2) */}
      <div className="absolute bottom-0 left-0 w-full z-0">
        <svg
          className="w-full h-24 md:h-32 lg:h-48"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
        >
          <path
            fill="#111827"
            d="M0,288L48,272C96,256,192,224,288,208C384,192,480,192,576,197.3C672,203,768,213,864,197.3C960,181,1056,139,1152,112C1248,85,1344,75,1392,69.3L1440,64L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
          ></path>
        </svg>
      </div>
    </section>
  );
}