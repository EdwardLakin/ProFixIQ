'use client';

import Link from 'next/link';
import Container from '@/components/ui/Container';
import Section from '@/components/ui/Section';
import Card from '@/components/ui/Card';
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';

export default function ProFixIQLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0d0d0d] to-[#121212] text-white font-sans">
      <main className="py-10 px-4">
        <Header title="Welcome to ProFixIQ" subtitle="The AI-powered diagnostic platform built for pros and DIYers." />

        <Container className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <Link href="/ai">
            <Card>
              <h2 className="text-xl font-blackops text-white">AI Diagnosis</h2>
              <p className="text-sm text-gray-300 mt-2">Chat, Visual, and DTC Code Support</p>
            </Card>
          </Link>

          <Link href="/workorders">
            <Card>
              <h2 className="text-xl font-blackops text-white">Work Orders</h2>
              <p className="text-sm text-gray-300 mt-2">Create, Edit, and Track Work Orders</p>
            </Card>
          </Link>

          <Link href="/inspections">
            <Card>
              <h2 className="text-xl font-blackops text-white">Inspections</h2>
              <p className="text-sm text-gray-300 mt-2">CVIP, Used, Custom, and More</p>
            </Card>
          </Link>

          <Link href="/vin">
            <Card>
              <h2 className="text-xl font-blackops text-white">VIN Decoder</h2>
              <p className="text-sm text-gray-300 mt-2">Decode and Analyze Vehicle Info</p>
            </Card>
          </Link>

          <Link href="/history">
            <Card>
              <h2 className="text-xl font-blackops text-white">Repair History</h2>
              <p className="text-sm text-gray-300 mt-2">Track Issues by VIN and Customer</p>
            </Card>
          </Link>

          <Link href="/booking">
            <Card>
              <h2 className="text-xl font-blackops text-white">Customer Booking</h2>
              <p className="text-sm text-gray-300 mt-2">Self-Service Scheduling with Quotes</p>
            </Card>
          </Link>
        </Container>
      </main>

      <Footer />
    </div>
  );
}