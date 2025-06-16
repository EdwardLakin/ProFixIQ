'use client';

import React from 'react';
import clsx from 'clsx';

type SectionProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export default function Section({ title, children, className }: SectionProps) {
  return (
    <section
      className={clsx(
        'bg-surface rounded-lg shadow-card px-4 py-6 md:px-6 md:py-8',
        className
      )}
    >
      {title && <h2 className="text-2xl font-bold text-accent mb-4">{title}</h2>}
      {children}
    </section>
  );
}