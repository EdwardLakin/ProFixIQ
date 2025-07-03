'use client';

import React from 'react';

interface SectionHeaderProps {
  title: string;
}

export default function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <div className="text-center mb-4">
      <h2 className="text-2xl text-orange-400 font-black uppercase tracking-widest">
        {title}
      </h2>
    </div>
  );
}