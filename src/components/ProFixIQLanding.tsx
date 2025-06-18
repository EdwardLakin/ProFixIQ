'use client'

import Link from 'next/link'
import Container from '@/components/ui/Container'
import Section from '@/components/ui/Section'
import Card from '@/components/ui/Card'
import Header from '@/components/ui/Header'
import Footer from '@/components/ui/Footer'

export default function ProFixIQLanding() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0c0c0c] to-[#121e2e] text-white font-sans">
      <Header />

      <main className="flex flex-col items-center justify-center py-10 px-4 space-y-6">
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-blackops text-orange-500 text-center">
          Welcome to ProFixIQ
        </h1>
        <p className="text-lg sm:text-xl text-muted max-w-xl text-center">
          The AI-powered diagnostic platform built for pros and DIYers.
        </p>

        <Container className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-5xl mt-10">
          {/* AI Diagnosis */}
          <Link href="/ai">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">AI Diagnosis</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  Chat, Visual, and DTC Code Support
                </p>
              </div>
            </Card>
          </Link>

          {/* Work Orders */}
          <Link href="/workorders">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">Work Orders</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  Create, Edit, and Track Work Orders
                </p>
              </div>
            </Card>
          </Link>

          {/* Inspections */}
          <Link href="/inspections">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">Inspections</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  CVIP, Used, Custom, and More
                </p>
              </div>
            </Card>
          </Link>

          {/* VIN Decoder */}
          <Link href="/vin">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">VIN Decoder</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  Decode and Analyze Vehicle Info
                </p>
              </div>
            </Card>
          </Link>

          {/* Repair History */}
          <Link href="/history">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">Repair History</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  Track Issues by VIN and Customer
                </p>
              </div>
            </Card>
          </Link>

          {/* Customer Booking */}
          <Link href="/booking">
            <Card className="bg-black border border-orange-500 hover:shadow-orange hover:scale-105 transition duration-200">
              <div className="h-full w-full flex flex-col justify-center items-center p-6">
                <h2 className="text-2xl font-bold text-white text-center font-blackops">Customer Booking</h2>
                <p className="text-gray-300 mt-2 text-sm text-center">
                  Self-Service Scheduling with Quotes
                </p>
              </div>
            </Card>
          </Link>
        </Container>
      </main>

      <Footer />
    </div>
  )
}