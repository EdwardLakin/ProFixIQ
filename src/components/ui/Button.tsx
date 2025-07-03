'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

const Button = ({ children, className = '', ...props }: ButtonProps) => {
  return (
    <button
      className={`px-4 py-2 rounded bg-orange-600 text-white font-bold hover:bg-orange-700 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export { Button };