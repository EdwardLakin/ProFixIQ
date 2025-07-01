// components/inspection/AutoScrollToItem.tsx

import { useEffect, useRef } from 'react';

interface AutoScrollToItemProps {
  trigger: boolean;
}

const AutoScrollToItem = ({ trigger }: AutoScrollToItemProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (trigger && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [trigger]);

  return <div ref={ref} className="h-0 w-0" />;
};

export default AutoScrollToItem;