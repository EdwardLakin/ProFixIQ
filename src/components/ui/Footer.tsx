'use client';

import React from 'react';

export default function Footer() {
  return (
    <footer className="w-full py-6 mt-12 border-t border-border bg-surface text-muted text-sm text-center">
      <p>© {new Date().getFullYear()} ProFixIQ. All rights reserved.</p>
    </footer>
  );
}