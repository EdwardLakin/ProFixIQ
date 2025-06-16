'use client';

import React from 'react';

type HeaderProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // optional buttons or actions
};

export default function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <div className="bg-surface text-accent shadow-card rounded p-4 mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center space-x-2">{children}</div>}
    </div>
  );
}