// src/components/inspection/SmartHighlight.tsx

import { useEffect, useRef } from 'react';

interface SmartHighlightProps {
  active: boolean;
  children: React.ReactNode;
}

export default function SmartHighlight({ active, children }: SmartHighlightProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.classList.add('ring-2', 'ring-orange-400');
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timeout = setTimeout(() => {
        ref.current?.classList.remove('ring-2', 'ring-orange-400');
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [active]);

  return (
    <div ref={ref} className="transition-all duration-300">
      {children}
    </div>
  );
}