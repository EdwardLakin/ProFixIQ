'use client';

import { useEffect, useRef } from 'react';

export default function AutoScrollToItem() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return <div ref={ref} />;
}