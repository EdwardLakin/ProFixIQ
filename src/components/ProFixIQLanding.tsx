'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import Navbar from '@components/Navbar';
import LandingHero from '@components/ui/LandingHero';
import PlanComparison from 'app/landing/PlanComparison';
import LandingButtons from '@components/LandingButtons';
import SubscribeBanner from '@components/SubscribeBanner';
import Chatbot from '@components/Chatbot';
import Particles from 'react-tsparticles';
import { loadFull } from 'tsparticles';
import type { Engine } from 'tsparticles-engine';

export default function ProFixLanding() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const particlesInit = async (engine: any): Promise<void> => {
  await loadFull(engine);
};

  return (
    <div className="relative font-header bg-gradient-to-b from-black via-neutral-900 to-black text-white overflow-hidden">
      <Toaster position="top-center" />
      <Navbar />

      {/* Particle Background */}
      {mounted && (
        <Particles
          id="tsparticles"
          init={particlesInit}
          options={{
            fullScreen: { enable: false },
            background: { color: 'transparent' },
            fpsLimit: 60,
            particles: {
              number: { value: 50 },
              size: { value: 2 },
              color: { value: '#f97316' },
              move: { enable: true, speed: 0.5 },
              opacity: { value: 0.5 },
              links: {
                enable: true,
                distance: 120,
                color: '#f97316',
                opacity: 0.4,
                width: 1,
              },
            },
            interactivity: {
              events: { onHover: { enable: true, mode: 'repulse' }, resize: true },
              modes: { repulse: { distance: 80 } },
            },
          }}
          className="absolute inset-0 z-0"
        />
      )}

      {/* Wave SVG Top */}
      <svg className="absolute top-0 left-0 w-full h-24 z-10" viewBox="0 0 1440 100" preserveAspectRatio="none">
        <path
          fill="#000"
          fillOpacity="1"
          d="M0,0L60,13.3C120,27,240,53,360,69.3C480,85,600,91,720,80C840,69,960,43,1080,37.3C1200,32,1320,48,1380,56L1440,64L1440,0L1380,0C1320,0,1200,0,1080,0C960,0,840,0,720,0C600,0,480,0,360,0C240,0,120,0,60,0L0,0Z"
        ></path>
      </svg>

      <main className="relative z-10 pt-24 max-w-7xl mx-auto px-4">
        <LandingHero />
        <SubscribeBanner />
        <LandingButtons />
        <PlanComparison />
        <Chatbot />
      </main>

      {/* Wave SVG Bottom */}
      <svg className="absolute bottom-0 left-0 w-full h-32 z-10" viewBox="0 0 1440 150" preserveAspectRatio="none">
        <path
          fill="#000"
          d="M0,0L80,16C160,32,320,64,480,74.7C640,85,800,75,960,64C1120,53,1280,43,1360,37.3L1440,32L1440,150L1360,150C1280,150,1120,150,960,150C800,150,640,150,480,150C320,150,160,150,80,150L0,150Z"
        />
      </svg>
    </div>
  );
}