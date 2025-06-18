'use client';

import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import Card from '@/components/ui/Card';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';

export default function ProFixIQLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0c0c0c] to-[#121212] text-white font-sans">
      <main className="flex flex-col items-center justify-center py-10 px-4 space-y-6">
        <h1 className="text-6xl sm:text-7xl md:text-8xl font-blackops text-orange-500 tracking-wide text-center">
          Welcome to ProFixIQ
        </h1>
        <p className="text-lg text-neutral-300 max-w-xl text-center">
          The AI-powered diagnostic platform built for pros and DIYers.
        </p>

        <Container className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl mt-10">
          {[
            {
              title: 'AI Diagnosis',
              subtitle: 'Chat, Visual, and DTC Code Support',
              href: '/ai',
            },
            {
              title: 'Work Orders',
              subtitle: 'Create, Edit, and Track Work Orders',
              href: '/work-orders',
            },
            {
              title: 'Inspections',
              subtitle: 'CVIP, Used, Custom, and More',
              href: '/inspections',
            },
            {
              title: 'VIN Decoder',
              subtitle: 'Decode and Analyze Vehicle Info',
              href: '/vin',
            },
            {
              title: 'Repair History',
              subtitle: 'Track Issues by VIN and Customer',
              href: '/history',
            },
            {
              title: 'Customer Booking',
              subtitle: 'Self-Service Scheduling with Quotes',
              href: '/booking',
            },
          ].map(({ title, subtitle, href }) => (
            <Link key={href} href={href}>
              <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200 p-8 sm:p-10 md:p-12 min-h-[160px] w-full flex flex-col justify-center items-center">
                <h2 className="font-blackops text-3xl sm:text-4xl text-white text-center tracking-wide uppercase">
                  {title}
                </h2>
                <p className="text-sm text-gray-300 mt-2 text-center">{subtitle}</p>
              </Card>
            </Link>
          ))}
        </Container>
      </main>
      <Footer />
    </div>
  );
}