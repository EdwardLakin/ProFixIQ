// components/inspection/SmartHighlight.tsx

import { useEffect, useRef } from 'react';

interface SmartHighlightProps {
  trigger: boolean;
  children: React.ReactNode;
}

const SmartHighlight: React.FC<SmartHighlightProps> = ({ trigger, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger && ref.current) {
      ref.current.classList.add('bg-yellow-400/20', 'transition');
      const timeout = setTimeout(() => {
        ref.current?.classList.remove('bg-yellow-400/20');
      }, 800);
      return () => clearTimeout(timeout);
    }
  }, [trigger]);

  return <div ref={ref}>{children}</div>;
};

export default SmartHighlight;