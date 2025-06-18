'use client';

import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import Card from '@/components/ui/Card';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';

export default function ProFixIQLanding() {
  const tools = [
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
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0c0c0c] to-[#121212] text-white font-sans">
      <main className="flex flex-col items-center justify-center px-4 py-10">
        <Header
          title="Welcome To"
          highlight="ProFixIQ"
          subtitle="The AI-powered diagnostic platform built for pros and DIYers."
        />

        <Container className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl w-full mt-10">
          {tools.map(({ title, subtitle, href }) => (
            <Link key={href} href={href}>
              <Card className="bg-black/50 border border-orange-500 hover:shadow-orange transition-all p-6 hover:scale-[1.03] flex flex-col justify-center items-center rounded-xl">
                <h2 className="font-blackops text-3xl text-white text-center mb-2">
                  {title}
                </h2>
                <p className="text-gray-300 text-sm text-center">{subtitle}</p>
              </Card>
            </Link>
          ))}
        </Container>
      </main>

      <Footer />
    </div>
  );
}