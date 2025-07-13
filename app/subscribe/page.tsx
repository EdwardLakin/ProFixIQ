'use client';

import Link from 'next/link';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const features = [
  { name: 'AI Diagnosis', tiers: ['free', 'diy', 'pro', 'pro_plus'] },
  { name: 'Inspection Flow', tiers: ['pro', 'pro_plus'] },
  { name: 'Photo to Quote', tiers: ['pro', 'pro_plus'] },
  { name: 'Work Orders', tiers: ['pro', 'pro_plus'] },
  { name: 'AI Chatbot', tiers: ['free', 'diy', 'pro', 'pro_plus'] },
  { name: 'Smart Scheduling', tiers: ['pro_plus'] },
  { name: 'Customer Portal', tiers: ['pro', 'pro_plus'] },
  { name: 'Voice Input', tiers: ['pro', 'pro_plus'] },
  { name: 'Parts Lookup', tiers: ['pro', 'pro_plus'] },
  { name: 'Deferred Tracking', tiers: ['pro', 'pro_plus'] },
  { name: 'Custom Inspections', tiers: ['pro', 'pro_plus'] },
];

const tiers = ['Free', 'DIY', 'Pro', 'Pro+'];
const tierKeys = ['free', 'diy', 'pro', 'pro_plus'];

export default function ComparePlansPage() {
  return (
    <div className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-5xl font-blackops text-orange-500 text-center mb-4">
          Compare Plans
        </h1>
        <p className="text-center text-neutral-400 mb-10">
          Choose the right plan for your needs. Upgrade anytime to unlock more features and shop tools.
        </p>

        <div className="overflow-auto">
          <table className="min-w-full border border-orange-500 text-sm text-center">
            <thead className="bg-orange-500 text-white">
              <tr>
                <th className="py-3 px-4 text-left">Feature</th>
                {tiers.map((tier) => (
                  <th key={tier} className="py-3 px-4">
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-neutral-900 text-white divide-y divide-neutral-800">
              {features.map((feature) => (
                <tr key={feature.name}>
                  <td className="text-left py-3 px-4 font-medium">{feature.name}</td>
                  {tierKeys.map((tier) => (
                    <td key={tier} className="py-3 px-4">
                      {feature.tiers.includes(tier) ? (
                        <FaCheckCircle className="text-green-500 mx-auto" />
                      ) : (
                        <FaTimesCircle className="text-red-500 mx-auto" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-center mt-10">
          <Link
            href="/onboarding/plan"
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded text-lg font-bold shadow"
          >
            Upgrade Plan
          </Link>
        </div>
      </div>
    </div>
  );
}