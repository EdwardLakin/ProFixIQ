'use client';

import React from 'react';
import clsx from 'clsx';

type ContainerProps = {
  children: React.ReactNode;
  className?: string;
};

export default function Container({ children, className }: ContainerProps) {
  return (
    <div className={clsx('max-w-4xl mx-auto px-4 md:px-6', className)}>
      {children}
    </div>
  );
}