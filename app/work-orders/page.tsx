'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Heading from '@/components/ui/Header';
import Card from '@/components/ui/Card';

export default function WorkOrdersPage() {
  const router = useRouter();

  const actions = [
    {
      title: 'View Work Orders',
      description: 'Access active and completed jobs.',
      route: '/work-orders/list',
    },
    {
      title: 'Create Work Order',
      description: 'Start a new repair or inspection job.',
      route: '/work-orders/create',
    },
    {
      title: 'Review Quotes',
      description: 'Review and approve customer quotes.',
      route: '/work-orders/quote-review',
    },
  ];

  return (
    <div className="min-h-screen px-4 py-10 sm:px-8">
      <Heading
        title="Work Orders"
        highlight="ProFixIQ"
        subtitle="Manage, track, and create work orders efficiently"
        center
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-10 max-w-6xl mx-auto">
        {actions.map((action) => (
          <Card
            key={action.title}
            onClick={() => router.push(action.route)}
          >
            <div className="p-6">
              <h3 className="text-2xl font-header text-orange-400 drop-shadow mb-2">
                {action.title}
              </h3>
              <p className="text-neutral-300 leading-snug">
                {action.description}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}