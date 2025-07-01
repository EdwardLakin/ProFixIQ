// src/components/inspection/AutoScroll.tsx
import { useEffect, useRef } from 'react';

const useAutoScroll = (dependency: any) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [dependency]);

  return ref;
};

export default useAutoScroll;