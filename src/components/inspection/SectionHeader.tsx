'use client';

import React from 'react';

interface SectionHeaderProps {
  title: string;
  section: number;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="text-center mb-4">
      <h2 className="text-2xl font-bold text-orange-400 uppercase tracking-widest">
        {title}
      </h2>
    </div>
  );
}