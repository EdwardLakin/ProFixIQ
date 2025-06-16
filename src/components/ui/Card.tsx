'use client';

import React from 'react';
import clsx from 'clsx';

type CardProps = {
  title?: string;
  children: React.ReactNode;
  className?: string;
};

export default function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={clsx(
        'bg-surface text-white rounded-xl shadow-card p-4 md:p-6',
        className
      )}
    >
      {title && <h2 className="text-xl font-semibold mb-4 text-accent">{title}</h2>}
      {children}
    </div>
  );
}