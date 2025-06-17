'use client'

import Link from 'next/link'

const menuItems = [
  {
    title: 'AI Diagnosis',
    description: 'Snap a photo or enter a code to get AI repair help.',
    href: '/ai',
  },
  {
    title: 'Work Orders',
    description: 'Create, track, and manage repair work orders.',
    href: '/workorders',
  },
  {
    title: 'Inspections',
    description: 'Start or review vehicle inspections and reports.',
    href: '/inspections',
  },
  {
    title: 'VIN Decoder',
    description: 'Decode VINs and auto-fill vehicle data.',
    href: '/vin',
  },
  {
    title: 'Repair History',
    description: 'View previous diagnostics, repairs, and visits.',
    href: '/history',
  },
  {
    title: 'Customer Booking',
    description: 'Customers can request appointments or quotes.',
    href: '/booking',
  },
]

export default function ProFixIQLanding() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center bg-cover bg-center px-4"
      style={{ backgroundImage: 'url("/carbon-weave.png")' }}
    >
      <h1 className="text-5xl lg:text-6xl font-blackops text-accent mb-2 text-center">
        Welcome to ProFixIQ
      </h1>
      <p className="text-muted text-center mb-10 max-w-xl">
        The AI-powered diagnostic platform built for pros and DIYers.
      </p>

      <div className="space-y-10 w-full max-w-md">
        {menuItems.map((item) => (
          <Link key={item.title} href={item.href}>
            <div className="rounded-xl border-2 border-accent bg-black shadow-lg text-white px-6 py-6 hover:scale-[1.02] transition duration-200 text-center">
              <h2 className="text-2xl font-blackops mb-2">{item.title}</h2>
              <p className="text-sm text-white opacity-80">{item.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}