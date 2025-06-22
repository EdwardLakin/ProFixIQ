'use client';

import React from 'react';
import { features } from '@/lib/plan/features';
import FeatureCard from '@combonents/FeatureCard';

export default function FeaturesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-center text-white mb-8">ProFixIQ Features</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {Object.entries(features).map(([featureId, config]) => (
          <FeatureCard
            key={featureId}
            id={featureId}
            label={formatFeatureLabel(featureId)}
          />
        ))}
      </div>
    </div>
  );
}

// Optional: format snake-case or kebab-case into human readable
function formatFeatureLabel(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}