'use client';

import Link from 'next/link';
import React from 'react';
import { FaCheck, FaTimes } from 'react-icons/fa';

export default function ComparePlansPage() {
  const features = [
    'AI Diagnosis (limited or full)',
    'Inspection System',
    'Work Orders',
    'Voice-Controlled Inspections',
    'Photo-to-Quote',
    'PDF Export',
    'Custom Inspection Creation',
    'Shop Setup & Team Roles',
    'User Limit',
    'Priority Support',
  ];

  const plans = [
    {
      name: 'Free',
      price: '$0',
      description: 'Get started with limited AI features',
      values: [
        '5 uses/month',
        <FaTimes key="free-1" className="text-red-500 mx-auto" />,
        <FaTimes key="free-2" className="text-red-500 mx-auto" />,
        <FaTimes key="free-3" className="text-red-500 mx-auto" />,
        <FaTimes key="free-4" className="text-red-500 mx-auto" />,
        <FaTimes key="free-5" className="text-red-500 mx-auto" />,
        <FaTimes key="free-6" className="text-red-500 mx-auto" />,
        <FaTimes key="free-7" className="text-red-500 mx-auto" />,
        '1 user',
        <FaTimes key="free-8" className="text-red-500 mx-auto" />,
      ],
    },
    {
      name: 'DIY',
      price: '$9',
      description: 'Basic access for home users',
      values: [
        'Basic AI diagnosis',
        <FaCheck key="diy-1" className="text-green-400 mx-auto" />,
        <FaTimes key="diy-2" className="text-red-500 mx-auto" />,
        <FaTimes key="diy-3" className="text-red-500 mx-auto" />,
        <FaTimes key="diy-4" className="text-red-500 mx-auto" />,
        <FaCheck key="diy-5" className="text-green-400 mx-auto" />,
        <FaTimes key="diy-6" className="text-red-500 mx-auto" />,
        <FaTimes key="diy-7" className="text-red-500 mx-auto" />,
        '1 user',
        <FaTimes key="diy-8" className="text-red-500 mx-auto" />,
      ],
    },
    {
      name: 'Pro',
      price: '$49',
      description: 'Solo pros with full inspections and work orders',
      values: [
        'Unlimited AI',
        <FaCheck key="pro-1" className="text-green-400 mx-auto" />,
        <FaCheck key="pro-2" className="text-green-400 mx-auto" />,
        <FaCheck key="pro-3" className="text-green-400 mx-auto" />,
        <FaCheck key="pro-4" className="text-green-400 mx-auto" />,
        <FaCheck key="pro-5" className="text-green-400 mx-auto" />,
        'Limited',
        <FaTimes key="pro-6" className="text-red-500 mx-auto" />,
        '1 user',
        'Standard',
      ],
    },
    {
      name: 'Pro+',
      price: '$99',
      description: 'Shops & teams with full automation',
      values: [
        'Unlimited AI',
        <FaCheck key="proplus-1" className="text-green-400 mx-auto" />,
        <FaCheck key="proplus-2" className="text-green-400 mx-auto" />,
        <FaCheck key="proplus-3" className="text-green-400 mx-auto" />,
        <FaCheck key="proplus-4" className="text-green-400 mx-auto" />,
        <FaCheck key="proplus-5" className="text-green-400 mx-auto" />,
        'Unlimited',
        '✔ Admin, Manager, Mechanic',
        '5 users (expandable)',
        'Priority',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white px-4 py-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-blackops text-orange-500">Compare Plans</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded text-black font-blackops"
          >
            Home
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border border-orange-500 text-sm text-left">
            <thead className="bg-neutral-800 text-orange-400">
              <tr>
                <th className="px-4 py-3 border border-orange-500">Features</th>
                {plans.map((plan) => (
                  <th
                    key={plan.name}
                    className="px-4 py-3 border border-orange-500 text-center"
                  >
                    <div className="text-lg font-blackops text-white">{plan.name}</div>
                    <div className="text-orange-400">{plan.price}/mo</div>
                    <div className="text-gray-400 text-xs mt-1">{plan.description}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature, i) => (
                <tr
                  key={feature}
                  className={i % 2 === 0 ? 'bg-neutral-900' : 'bg-neutral-950'}
                >
                  <td className="px-4 py-3 border border-orange-500 font-medium">
                    {feature}
                  </td>
                  {plans.map((plan) => (
                    <td
                      key={plan.name + '-' + i}
                      className="px-4 py-3 border border-orange-500 text-center"
                    >
                      {plan.values[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/subscribe"
            className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-blackops rounded-lg text-lg"
          >
            Choose Your Plan
          </Link>
        </div>
      </div>
    </div>
  );
}